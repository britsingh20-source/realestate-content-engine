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
  const title = String(candidate.source?.title || '').toLowerCase();
  const text = `${title} ${candidate.source?.description || ''} ${sourceNotes?.text || ''}`.toLowerCase();
  const has = re => re.test(text);

  // Construction/building-system subjects must never leak into SafeBuy merely
  // because the source also says "plot", "handover", "inspection" or "checklist".
  const constructionSystem = has(/electrical|earthing|grounding|wiring|conduit|mcb|rccb|db box|distribution board|beam|column|slab|concrete|reinforcement|rebar|steel|foundation|footing|plinth|lintel|brick|block masonry|masonry|curing|shuttering|formwork|waterproof|plumbing|pipe pressure|floor trap|bottle trap|plaster|structural crack|tile laying|construction method|workmanship/);

  if (niche === 'buyer_education') {
    if (constructionSystem) return false;
    return has(/buyer|buying|home inspection|handover|apartment|villa|parking|lift|maintenance|amenit|defect|snag|checklist|before buying|before purchase|new home|homebuyer/);
  }
  if (niche === 'documentation') {
    if (constructionSystem) return false;
    return has(/sale deed|encumbrance|\bec\b|patta|title|rera|approval|legal|ownership|registration|document|survey number|power of attorney|litigation|due diligence/);
  }
  if (niche === 'land_selection') {
    const landEvidence = has(/\bplot\b|\bland\b|site selection|soil|boundary|access road|road width|drainage|flood|slope|survey|frontage|layout|approach road/);
    const buildingDefect = has(/roof|ceiling|terrace|wall damp|waterproofing|plaster|slab leakage|bathroom leakage/);
    return landEvidence && !buildingDefect && !constructionSystem;
  }
  if (niche === 'construction') {
    return has(/beam|column|slab|concrete|steel|foundation|footing|plinth|lintel|brick|block|waterproof|roof|ceiling|wall|construction|masonry|curing|plumbing|electrical|earthing|grounding|wiring|conduit|mcb|rccb|distribution board|leak|damp|tile|bathroom|floor trap|bottle trap|shuttering|formwork|reinforcement|rebar|crack|plaster|defect|inspection|workmanship/);
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

  const used = await usedSourceIds();
  const fresh = report.candidates.filter(candidate => !used.has(String(candidate.source?.id || '')));
  const ordered = [
    ...fresh.filter(isActionable),
    ...fresh.filter(c => !isActionable(c))
  ];

  let selected = null;
  let sourceNotes = null;
  for (const candidate of ordered.slice(0, 12)) {
    try {
      sourceNotes = await extractYoutubeTranscript(candidate.source.url);
    } catch (err) {
      console.log(`${niche}: transcript error for ${candidate.source.id}: ${err.message}`);
      sourceNotes = null;
    }
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
  if (mode === 'safebuy') targets = ['buyer_education', 'documentation', 'land_selection'];
  else if (mode === 'builders') targets = ['construction'];
  else throw new Error('Usage: node src/runBrandPilot.js safebuy|builders');

  let sent = 0;
  for (const niche of targets) {
    try {
      if (await processNiche(niche, niches[niche])) sent++;
    } catch (err) {
      console.error(`${niche}: generation failed: ${err.message}`);
    }
  }
  console.log(`${mode}: completed; prompts sent=${sent}`);
}

main().catch(err => { console.error(err); process.exitCode = 1; });
