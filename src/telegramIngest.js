import fs from 'node:fs/promises';
import { findPending, markPublished, savePublishProgress } from './contentQueue.js';
import { uploadVideoToR2 } from './storage/r2.js';
import { publishYouTubeShort } from './publish/youtube.js';
import { publishInstagramReel, publishInstagramStory } from './publish/instagram.js';
import { sendStatus } from './telegram.js';

const OFFSET_PATH = 'data/telegram-offset.json';
const ID_RE = /\b(?:INV|DOC|LAND|CON|BUY)-\d{8}-[A-Z0-9]{4}\b/i;

async function loadJson(path) { return JSON.parse(await fs.readFile(path, 'utf8')); }
async function readOffset() { try { return (await loadJson(OFFSET_PATH)).offset || 0; } catch { return 0; } }
async function saveOffset(offset) { await fs.mkdir('data', { recursive:true }); await fs.writeFile(OFFSET_PATH, JSON.stringify({ offset }, null, 2)); }

function extractContentId(message) {
  const candidates = [message.caption, message.text, message.reply_to_message?.text, message.reply_to_message?.caption].filter(Boolean);
  for (const text of candidates) {
    const m = String(text).match(ID_RE);
    if (m) return m[0].toUpperCase();
  }
  return null;
}

function pickVideo(message) {
  if (message.video) return { fileId: message.video.file_id, mimeType: message.video.mime_type || 'video/mp4' };
  if (message.document) {
    const mime = String(message.document.mime_type || '').toLowerCase();
    const name = String(message.document.file_name || '').toLowerCase();
    if (mime.startsWith('video/') || name.endsWith('.mp4')) {
      return { fileId: message.document.file_id, mimeType: mime.startsWith('video/') ? mime : 'video/mp4' };
    }
  }
  return null;
}

async function telegramFile(fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const meta = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!meta.ok) throw new Error(`Telegram getFile ${meta.status}`);
  const path = (await meta.json()).result?.file_path;
  if (!path) throw new Error('Telegram file path missing');
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
  if (!res.ok) throw new Error(`Telegram download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function platformSucceeded(result) {
  return !!result && !result.error;
}

function publishingRoutes(niches) {
  return [...new Map(Object.values(niches).map(route => [route.brand, route])).values()];
}

function captionForBrand(caption, brandLabel) {
  return String(caption).replace(/Olive\s*Tree\s*(?:Builders|Investors|Safe\s*Buy)|OliveTree\s*(?:Builders|Investors|SafeBuy)/gi, brandLabel);
}

async function attempt(operation) {
  try { return await operation(); }
  catch (error) { return { error: error.message }; }
}

async function handleMessage(message, niches) {
  const video = pickVideo(message);
  if (!video) return;
  const contentId = extractContentId(message);
  if (!contentId) {
    await sendStatus('Video received, but I could not identify its VIDEO ID. Upload it with the VIDEO ID as caption or send the VIDEO ID first and then the MP4.');
    return;
  }
  let pending = await findPending(contentId);
  if (!pending) {
    await sendStatus(`Video received for ${contentId}, but no pending content record was found.`);
    return;
  }
  if (pending.status === 'published') {
    await sendStatus(`${contentId} was already published. Duplicate upload ignored.`);
    return;
  }
  if (pending.status === 'superseded') {
    await sendStatus(`${contentId} is a retired duplicate prompt and will not be published. Please use a new active VIDEO ID.`);
    return;
  }

  const bytes = await telegramFile(video.fileId);
  const key = `social-ready/${pending.niche}/${contentId}.mp4`;
  const publicUrl = pending.publishResult?.stagedVideo || await uploadVideoToR2({ bytes, contentType: video.mimeType, key });
  const title = pending.pack?.title_english || pending.pack?.topic || pending.pack?.selected_hook || contentId;
  const hashtags = Array.isArray(pending.pack?.hashtags) ? pending.pack.hashtags.join(' ') : (pending.pack?.hashtags || '');
  const legacyEnglishCaption = [pending.pack?.topic, pending.pack?.core_takeaway, 'Follow OliveTree for clear, practical property insights.'].filter(Boolean).join('\n\n');
  const baseCaption = `${pending.pack?.caption_english || legacyEnglishCaption}\n\n${hashtags}`.trim();
  const targets = { ...(pending.publishResult?.targets || {}) };

  for (const route of publishingRoutes(niches)) {
    const result = { ...(targets[route.brand] || {}) };
    const caption = captionForBrand(baseCaption, route.brandLabel);
    if (!platformSucceeded(result.youtube)) {
      result.youtube = await attempt(() => publishYouTubeShort({ prefix: route.youtubeSecretPrefix, bytes, contentType: video.mimeType, title, description: caption }));
    }
    if (!platformSucceeded(result.instagramReel)) {
      result.instagramReel = await attempt(() => publishInstagramReel({ prefix: route.instagramSecretPrefix, videoUrl: publicUrl, caption }));
    }
    if (!platformSucceeded(result.instagramStory)) {
      result.instagramStory = await attempt(() => publishInstagramStory({ prefix: route.instagramSecretPrefix, videoUrl: publicUrl }));
    }
    targets[route.brand] = result;
    await savePublishProgress(contentId, { stagedVideo: publicUrl, targets });
  }

  const complete = publishingRoutes(niches).every(route =>
    ['youtube', 'instagramReel', 'instagramStory'].every(platform => platformSucceeded(targets[route.brand]?.[platform]))
  );
  if (complete) await markPublished(contentId, { stagedVideo: publicUrl, targets });

  const summary = publishingRoutes(niches).map(route => {
    const result = targets[route.brand];
    return `${route.brandLabel}: YouTube ${result.youtube?.url || result.youtube?.error}; Reel ${result.instagramReel?.mediaId || result.instagramReel?.error}; Story ${result.instagramStory?.mediaId || result.instagramStory?.error}`;
  }).join('\n');
  await sendStatus(`${contentId} publishing results:\n${summary}\nStatus: ${complete ? 'published everywhere' : 'partial; successful destinations will not be duplicated on retry'}`);
}

async function processWebhookDispatch(niches, chatId) {
  const raw = String(process.env.TELEGRAM_UPDATE_JSON || '').trim();
  if (!raw) return false;

  const update = JSON.parse(raw);
  const message = update?.message;
  if (!message) throw new Error('Cloudflare dispatch did not contain a Telegram message');
  if (String(message.chat?.id || '') !== chatId) throw new Error('Cloudflare dispatch chat ID does not match TELEGRAM_CHAT_ID');

  await handleMessage(message, niches);
  console.log(`Processed Cloudflare Telegram webhook update ${update.update_id ?? 'unknown'}`);
  return true;
}

async function processLegacyPolling(niches, token, chatId) {
  const offset = await readOffset();
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0&allowed_updates=message`);
  if (!res.ok) throw new Error(`Telegram getUpdates ${res.status}: ${await res.text()}`);
  const updates = (await res.json()).result || [];
  let nextOffset = offset;
  for (const u of updates) {
    nextOffset = Math.max(nextOffset, u.update_id + 1);
    if (String(u.message?.chat?.id || '') !== chatId) {
      await saveOffset(nextOffset);
      continue;
    }
    try {
      await handleMessage(u.message, niches);
    } catch (e) {
      await saveOffset(nextOffset);
      throw e;
    }
    await saveOffset(nextOffset);
  }
}

async function main() {
  const niches = await loadJson('config/niches.json');
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '');
  if (!token || !chatId) throw new Error('Missing Telegram credentials');

  if (await processWebhookDispatch(niches, chatId)) return;

  const recoveryFileId = String(process.env.RECOVERY_TELEGRAM_FILE_ID || '').trim();
  const recoveryContentId = String(process.env.RECOVERY_CONTENT_ID || '').trim().toUpperCase();
  if (recoveryFileId && recoveryContentId) {
    await handleMessage({
      chat: { id: chatId },
      caption: `VIDEO ID: ${recoveryContentId}`,
      document: { file_id: recoveryFileId, mime_type: 'video/mp4', file_name: `${recoveryContentId}.mp4` },
    }, niches);
    console.log(`Processed one-time recovery upload for ${recoveryContentId}`);
    return;
  }

  await processLegacyPolling(niches, token, chatId);
}

main().catch(async e => {
  console.error(e);
  try { await sendStatus(`Publishing error: ${e.message}`); } catch {}
  process.exitCode = 1;
});
