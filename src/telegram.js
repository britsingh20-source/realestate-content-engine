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

async function sendPromptDocument({ contentId, prompt, caption }) {
  const token = required('TELEGRAM_BOT_TOKEN');
  const chatId = required('TELEGRAM_CHAT_ID');
  const filename = `${contentId}-Gemini-Prompt.txt`;

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', caption);
  form.append('document', new Blob([prompt], { type: 'text/plain;charset=utf-8' }), filename);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: form
  });
  if (!res.ok) throw new Error(`Telegram sendDocument ${res.status}: ${await res.text()}`);
  return (await res.json()).result;
}

export async function sendContentPack(candidate, pack) {
  const contentId = candidate.contentId || 'UNASSIGNED';
  const geminiPrompt = String(pack.gemini_video_prompt || '').trim();
  if (!geminiPrompt) throw new Error('Missing gemini_video_prompt');

  const sourceUrl = candidate.source?.url || '';
  const topic = pack.topic || pack.coimbatore_angle || 'Property Investment';
  const caption = [
    `🌿 OliveTree Investors — Coimbatore`,
    `Topic: ${topic}`,
    `Content ID: ${contentId}`,
    `Source research: ${sourceUrl}`,
    ``,
    `Open the attached Gemini prompt file and copy all the text into Gemini.`,
    `After generation, upload the finished MP4 back to this bot with caption: ${contentId}`
  ].join('\n');

  return sendPromptDocument({ contentId, prompt: geminiPrompt, caption });
}

export async function sendStatus(text) {
  return send(`ℹ️ Realestate Content Engine\n${text}`);
}
