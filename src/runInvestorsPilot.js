import fs from 'node:fs/promises';
import { runNicheMonitor, saveNicheReport } from './multiNicheMonitor.js';
import { generateContentPack } from './geminiText.js';
import { sendContentPack } from './telegram.js';
import { addPending, makeContentId, usedSourceIds } from './contentQueue.js';
import { extractYoutubeTranscript } from './youtubeTranscript.js';

async function loadJson(path) { return JSON.parse(await fs.readFile(path, 'utf8')); }

function isActionable(c) {
  return c.viralScore >= 75 || (c.confirmations >= 1 && c.source.outlier >= 2) || c.source.outlier >= 3;
}

async function main() {
  const meta = (await loadJson('config/niches.json')).investment;
  const config = await loadJson(meta.creatorConfig);
  const report = await runNicheMonitor(config);
  await saveNicheReport(report);

  const used = await usedSourceIds({ brand: meta.brand });
  const fresh = report.candidates.filter(candidate => !used.has(String(candidate.source?.id || '')));
  const ordered = [
    ...fresh.filter(isActionable),
    ...fresh.filter(c => !isActionable(c))
  ];

  let selected = null;
  let transcript = null;
  for (const candidate of ordered.slice(0, 8)) {
    transcript = await extractYoutubeTranscript(candidate.source.url);
    if (transcript) {
      selected = candidate;
      break;
    }
    console.log(`Skipping ${candidate.source.id}: transcript/captions unavailable`);
  }

  if (!selected || !transcript) {
    console.log('investment: no transcript-backed breakout candidate found in current scan window');
    return;
  }

  const contentId = makeContentId('investment');
  const pack = await generateContentPack({
    ...selected,
    niche: 'investment',
    contentId,
    transcript: transcript.text,
    transcriptMeta: { subtitleFile: transcript.subtitleFile, chars: transcript.chars }
  });

  const record = {
    contentId,
    niche: 'investment',
    label: meta.label,
    brand: meta.brand,
    status: 'awaiting_video',
    createdAt: new Date().toISOString(),
    candidate: selected,
    transcriptMeta: { subtitleFile: transcript.subtitleFile, chars: transcript.chars },
    pack
  };

  await addPending(record);
  await sendContentPack({ ...selected, niche: 'investment', contentId, nicheLabel: 'OLIVETREE INVESTORS — COIMBATORE RESEARCH' }, pack);
  console.log(`investment: transcript-backed Coimbatore prompt sent to Telegram as ${contentId}`);
}

main().catch(err => { console.error(err); process.exitCode = 1; });
