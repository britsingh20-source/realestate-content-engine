function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function send(text) {
  const token = required('TELEGRAM_BOT_TOKEN');
  const chatId = required('TELEGRAM_CHAT_ID');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}

function chunks(text, size = 3800) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

export async function sendContentPack(candidate, pack) {
  const head = [
    `🔥 INVESTMENT CONTENT OPPORTUNITY`,
    `Viral score: ${candidate.viralScore}/100`,
    `Source creator: ${candidate.creator}`,
    `Outlier: ${candidate.source.outlier.toFixed(2)}x`,
    `Cross-creator confirmations: ${candidate.confirmations}`,
    `Source signal: ${candidate.source.url}`,
    ``,
    `OUR ORIGINAL ANGLE`,
    pack.original_angle,
    ``,
    `SELECTED HOOK`,
    pack.selected_hook,
    ``,
    `TAMIL VOICEOVER`,
    pack.voiceover_tamil
  ].join('\n');

  for (const part of chunks(head)) await send(part);
  await send(`🎬 GEMINI VIDEO PROMPT\n\n${pack.gemini_video_prompt}`);
  await send(`📝 TITLE\n${pack.title_tamil}\n\nCAPTION\n${pack.caption_tamil}\n\n${Array.isArray(pack.hashtags) ? pack.hashtags.join(' ') : pack.hashtags}`);
}

export async function sendStatus(text) {
  return send(`ℹ️ Realestate Content Engine\n${text}`);
}
