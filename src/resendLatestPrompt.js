import fs from 'node:fs/promises';
import { sendContentPack } from './telegram.js';

async function main() {
  const raw = await fs.readFile('data/pending-content.json', 'utf8');
  const records = JSON.parse(raw);
  const latest = records.find(r => r.status === 'awaiting_video' && r?.pack?.gemini_video_prompt);
  if (!latest) throw new Error('No awaiting_video prompt found to resend');

  const candidate = {
    ...(latest.candidate || {}),
    contentId: latest.contentId,
    niche: latest.niche || 'investment'
  };

  await sendContentPack(candidate, latest.pack);
  console.log(`Resent latest Gemini prompt to Telegram: ${latest.contentId}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
