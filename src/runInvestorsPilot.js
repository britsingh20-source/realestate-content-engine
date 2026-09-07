import fs from 'node:fs/promises';
import { runNicheMonitor, saveNicheReport } from './multiNicheMonitor.js';
import { generateContentPack } from './geminiText.js';
import { sendContentPack } from './telegram.js';
import { addPending, makeContentId } from './contentQueue.js';

async function loadJson(path) { return JSON.parse(await fs.readFile(path, 'utf8')); }

function isActionable(c) {
  return c.viralScore >= 75 || (c.confirmations >= 1 && c.source.outlier >= 2) || c.source.outlier >= 3;
}

async function main() {
  const meta = (await loadJson('config/niches.json')).investment;
  const config = await loadJson(meta.creatorConfig);
  const report = await runNicheMonitor(config);
  await saveNicheReport(report);

  const selected = report.candidates.find(isActionable) || report.candidates[0];
  if (!selected) {
    console.log('investment: no breakout candidate found in current scan window');
    return;
  }

  const contentId = makeContentId('investment');
  const pack = await generateContentPack({ ...selected, niche: 'investment', contentId });
  const record = {
    contentId,
    niche: 'investment',
    label: meta.label,
    brand: meta.brand,
    status: 'awaiting_video',
    createdAt: new Date().toISOString(),
    candidate: selected,
    pack
  };

  await addPending(record);
  await sendContentPack({ ...selected, niche: 'investment', contentId, nicheLabel: 'OLIVETREE INVESTORS — YOUTUBE RESEARCH' }, pack);
  console.log(`investment: YouTube research prompt sent to Telegram as ${contentId}`);
}

main().catch(err => { console.error(err); process.exitCode = 1; });
