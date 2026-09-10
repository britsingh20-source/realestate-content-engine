import fs from 'node:fs/promises';
import { runNicheMonitor, saveNicheReport } from './multiNicheMonitor.js';
import { generateNicheContentPack } from './geminiNicheText.js';
import { sendContentPack } from './telegram.js';
import { addPending, makeContentId } from './contentQueue.js';
import { extractYoutubeTranscript } from './youtubeTranscript.js';

async function loadJson(path) { return JSON.parse(await fs.readFile(path, 'utf8')); }

function isActionable(c) {
  return c.viralScore >= 75 || (c.confirmations >= 1 && c.source.outlier >= 2) || c.source.outlier >= 3;
}

async function processNiche(niche, meta) {
  const config = await loadJson(meta.creatorConfig);
  let report;
  try {
    report = await runNicheMonitor(config);
  } catch (err) {
    console.warn(`${niche}: monitor unavailable: ${err.message}`);
    return false;
  }
  await saveNicheReport(report);

  const ordered = [
    ...report.candidates.filter(isActionable),
    ...report.candidates.filter(c => !isActionable(c))
  ];

  let selected = null;
  let sourceNotes = null;
  for (const candidate of ordered.slice(0, 8)) {
    sourceNotes = await extractYoutubeTranscript(candidate.source.url);
    if (sourceNotes) {
      selected = candidate;
      break;
    }
    console.log(`${niche}: skipping ${candidate.source.id}; source-video analysis unavailable`);
  }

  if (!selected || !sourceNotes) {
    console.log(`${niche}: no source-video-backed candidate found`);
    return false;
  }

  const contentId = makeContentId(niche);
  const pack = await generateNicheContentPack({
    ...selected,
    niche,
    contentId,
    transcript: sourceNotes.text,
    transcriptMeta: {
      subtitleFile: sourceNotes.subtitleFile,
      chars: sourceNotes.chars,
      method: sourceNotes.method,
      model: sourceNotes.model
    }
  });

  const record = {
    contentId,
    niche,
    label: meta.label,
    brand: meta.brand,
    brandLabel: meta.brandLabel,
    status: 'awaiting_video',
    createdAt: new Date().toISOString(),
    candidate: selected,
    transcriptMeta: {
      subtitleFile: sourceNotes.subtitleFile,
      chars: sourceNotes.chars,
      method: sourceNotes.method,
      model: sourceNotes.model
    },
    pack
  };

  await addPending(record);
  await sendContentPack({
    ...selected,
    niche,
    contentId,
    brandLabel: meta.brandLabel,
    nicheLabel: meta.label
  }, pack);
  console.log(`${niche}: source-video-backed ${meta.brandLabel} prompt sent to Telegram as ${contentId}`);
  return true;
}

async function main() {
  const mode = process.argv[2];
  const niches = await loadJson('config/niches.json');
  let targets;
  if (mode === 'safebuy') targets = ['documentation', 'land_selection'];
  else if (mode === 'builders') targets = ['construction'];
  else throw new Error('Usage: node src/runBrandPilot.js safebuy|builders');

  let sent = 0;
  for (const niche of targets) {
    if (await processNiche(niche, niches[niche])) sent++;
  }
  console.log(`${mode}: completed; prompts sent=${sent}`);
}

main().catch(err => { console.error(err); process.exitCode = 1; });
