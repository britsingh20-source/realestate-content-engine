import fs from 'node:fs/promises';
import { runNicheMonitor, saveNicheReport } from './multiNicheMonitor.js';
import { generateNicheContentPack } from './geminiNicheText.js';
import { sendContentPack } from './telegram.js';
import { addPending, makeContentId, usedSourceIds } from './contentQueue.js';
import { extractYoutubeTranscript } from './youtubeTranscript.js';

async function loadJson(path) { return JSON.parse(await fs.readFile(path, 'utf8')); }

function isActionable(c) {
  return c.viralScore >= 75 || (c.confirmations >= 1 && c.source.outlier >= 2) || c.source.outlier >= 3;
}

function sourceMatchesNiche(niche, candidate, sourceNotes) {
  const text = `${candidate.source?.title || ''} ${candidate.source?.description || ''} ${sourceNotes?.text || ''}`.toLowerCase();
  const has = re => re.test(text);
  if (niche === 'documentation') {
    return has(/sale deed|encumbrance|\bec\b|patta|property title|rera|approval|legal|ownership|registration|document|survey number|power of attorney|litigation/);
  }
  if (niche === 'land_selection') {
    const landEvidence = has(/\bplot\b|\bland\b|site selection|soil|boundary|access road|road width|ground drainage|surface drainage|flood|slope|survey stone|frontage/);
    const buildingDefect = has(/roof|ceiling|terrace|wall damp|waterproofing|plaster|slab leakage/);
    return landEvidence && !buildingDefect;
  }
  if (niche === 'construction') {
    return has(/beam|column|slab|concrete|steel|foundation|plinth|lintel|brick|waterproof|roof|ceiling|wall|construction/);
  }
  return true;
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

  const used = await usedSourceIds({ brand: meta.brand });
  const fresh = report.candidates.filter(candidate => !used.has(String(candidate.source?.id || '')));
  const ordered = [
    ...fresh.filter(isActionable),
    ...fresh.filter(c => !isActionable(c))
  ];

  let selected = null;
  let sourceNotes = null;
  for (const candidate of ordered.slice(0, 8)) {
    sourceNotes = await extractYoutubeTranscript(candidate.source.url);
    if (!sourceNotes) {
      console.log(`${niche}: skipping ${candidate.source.id}; source-video analysis unavailable`);
      continue;
    }
    if (!sourceMatchesNiche(niche, candidate, sourceNotes)) {
      console.log(`${niche}: skipping ${candidate.source.id}; source subject does not match niche`);
      continue;
    }
    selected = candidate;
    break;
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
