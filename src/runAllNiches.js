import fs from 'node:fs/promises';
import { runNicheMonitor, saveNicheReport } from './multiNicheMonitor.js';
import { generateContentPack } from './geminiText.js';
import { sendContentPack } from './telegram.js';
import { addPending, makeContentId, usedSourceIds } from './contentQueue.js';

async function loadJson(path) { return JSON.parse(await fs.readFile(path, 'utf8')); }

function isActionable(c) {
  return c.viralScore >= 80 || (c.confirmations >= 2 && c.source.outlier >= 2) || (c.source.outlier >= 5 && c.source.velocityRatio >= 3);
}

async function main() {
  const niches = await loadJson('config/niches.json');
  for (const [niche, meta] of Object.entries(niches)) {
    const config = await loadJson(meta.creatorConfig);
    const report = await runNicheMonitor(config);
    await saveNicheReport(report);
    const used = await usedSourceIds();
    const selected = report.candidates.filter(isActionable).find(candidate => !used.has(String(candidate.source?.id || '')));
    if (!selected) {
      console.log(`${niche}: no actionable breakout`);
      continue;
    }

    const contentId = makeContentId(niche);
    const pack = await generateContentPack({ ...selected, niche, contentId });
    const record = {
      contentId,
      niche,
      label: meta.label,
      status: 'awaiting_video',
      createdAt: new Date().toISOString(),
      candidate: selected,
      pack
    };
    await addPending(record);
    await sendContentPack({ ...selected, niche, contentId, nicheLabel: meta.label }, pack);
    console.log(`${niche}: sent ${contentId}`);
  }
}

main().catch(err => { console.error(err); process.exitCode = 1; });
