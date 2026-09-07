function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function send(text) {
  const token = required('TELEGRAM_BOT_TOKEN');
  const chatId = required('TELEGRAM_CHAT_ID');
  if (String(text).length > 4090) throw new Error(`Telegram message too long: ${String(text).length} chars`);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
  return (await res.json()).result;
}

export async function sendContentPack(candidate, pack) {
  const contentId = candidate.contentId || 'UNASSIGNED';
  const hashtags = Array.isArray(pack.hashtags) ? pack.hashtags.join(' ') : (pack.hashtags || '');

  // Message 1: compact research/context only. Do not mix this with the copyable Gemini prompt.
  const summary = [
    `🌿 OLIVETREE INVESTORS — COIMBATORE`,
    `CONTENT ID: ${contentId}`,
    `Source: ${candidate.source.url}`,
    `Coimbatore angle: ${pack.coimbatore_angle || pack.topic || ''}`,
    ``,
    `✅ COPY THE ENTIRE NEXT MESSAGE DIRECTLY INTO GEMINI.`
  ].join('\n');
  const firstMessage = await send(summary);

  // Message 2: prompt only, deliberately no heading/prefix/suffix so Telegram "copy all" copies only the Gemini prompt.
  const geminiPrompt = String(pack.gemini_video_prompt || '').trim();
  if (!geminiPrompt) throw new Error('Missing gemini_video_prompt');
  await send(geminiPrompt);

  // Message 3: publishing metadata kept separate from the generation prompt.
  const publishInfo = [
    `📝 PUBLISHING DETAILS — ${contentId}`,
    `TITLE: ${pack.title_tamil || ''}`,
    ``,
    `CAPTION: ${pack.caption_tamil || ''}`,
    ``,
    `HASHTAGS: ${hashtags}`,
    ``,
    `UPLOAD RULE: After Gemini generates the video, upload it back here with caption ${contentId}.`
  ].join('\n');
  await send(publishInfo);

  return firstMessage;
}

export async function sendStatus(text) {
  return send(`ℹ️ Realestate Content Engine\n${text}`);
}
