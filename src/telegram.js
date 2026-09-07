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
  const prefix = [
    `🌿 OLIVETREE INVESTORS — COIMBATORE`,
    `CONTENT ID: ${contentId}`,
    `Transcript-backed YouTube research`,
    ``
  ].join('\n');

  let body = String(pack.telegram_prompt || '').trim();
  if (!body) {
    body = [
      `SOURCE: ${candidate.source.url}`,
      `COIMBATORE ANGLE: ${pack.coimbatore_angle || pack.topic || ''}`,
      ``,
      `GEMINI PROMPT`,
      pack.gemini_video_prompt || '',
      ``,
      `TITLE: ${pack.title_tamil || ''}`,
      `CAPTION: ${pack.caption_tamil || ''}`,
      `HASHTAGS: ${Array.isArray(pack.hashtags) ? pack.hashtags.join(' ') : (pack.hashtags || '')}`,
      ``,
      `UPLOAD: Send the finished video back with caption ${contentId}`
    ].join('\n');
  }

  const message = `${prefix}${body}`;
  return send(message);
}

export async function sendStatus(text) {
  return send(`ℹ️ Realestate Content Engine\n${text}`);
}
