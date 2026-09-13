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

const CONSTRUCTION_RE = /electrical|earthing|grounding|wiring|wire\b|conduit|mcb|rccb|rcbo|db box|distribution board|switchgear|socket|load test|insulation test|beam|column|slab|concrete|reinforcement|rebar|steel|foundation|footing|plinth|lintel|brick|block masonry|masonry|curing|shuttering|formwork|waterproof|damp proof|dpc\b|plumbing|pipe pressure|floor trap|bottle trap|drain pipe|soil pipe|plaster|structural crack|tile laying|tile adhesive|grout|construction method|workmanship|quality check|site execution|structural|rcc\b|pcc\b|screed|terrace treatment|roof treatment|wall crack|seepage|leakage/;
const DOCUMENT_RE = /sale deed|encumbrance|\bec\b|patta|title deed|title verification|rera|approval|legal|ownership|registration|document|survey number|power of attorney|litigation|due diligence|mother deed|parent document|guideline value|subdivision|fmb|chitta|adangal/;
const LAND_RE = /\bplot\b|\bland\b|site selection|soil condition|boundary|access road|road width|drainage|flood|slope|survey|frontage|layout|approach road|shape of plot|road access/;
const BUYER_RE = /buyer|buying|purchase|homebuyer|before buying|before purchase|booking|agreement|handover|possession|maintenance|amenit|parking allotment|association|builder promise|sale agreement|allotment|car park|common area/;

function constructionSubject(text) {
  return CONSTRUCTION_RE.test(String(text || '').toLowerCase());
}

function sourceMatchesNiche(niche, candidate, sourceNotes) {
  const title = String(candidate.source?.title || '').toLowerCase();
  const text = `${title} ${candidate.source?.description || ''} ${sourceNotes?.text || ''}`.toLowerCase();
  const isConstruction = constructionSubject(text);

  // SUBJECT-FIRST ROUTING:
  // If the actual lesson is a building system, construction method, workmanship,
  // material or structural/MEP quality check, Builders wins even when the source
  // also says buyer, handover, villa inspection, checklist, plot or possession.
  if (niche !== 'construction' && isConstruction) return false;

  if (niche === 'buyer_education') {
    return BUYER_RE.test(text) && !DOCUMENT_RE.test(text) && !LAND_RE.test(text);
  }
  if (niche === 'documentation') {
    return DOCUMENT_RE.test(text);
  }
  if (niche === 'land_selection') {
    return LAND_RE.test(text) && !DOCUMENT_RE.test(text);
  }
  if (niche === 'construction') {
    return isConstruction;
  }
  return true;
}

function packMatchesNiche(niche, pack) {
  const text = [
    pack?.topic,
    pack?.core_takeaway,
    pack?.title_english,
    pack?.caption_english,
    pack?.gemini_video_prompt,
    ...(Array.isArray(pack?.scenes) ? pack.scenes.map(s => `${s?.purpose || ''} ${s?.visual || ''} ${s?.on_screen_text || ''}`) : [])
  ].join(' ').toLowerCase();

  const isConstruction = constructionSubject(text);
  if (niche !== 'construction' && isConstruction) return false;
  if (niche === 'construction') return isConstruction;
  if (niche === 'documentation') return DOCUMENT_RE.test(text) || /legal|document|approval|title|ownership|registration/.test(text);
  if (niche === 'land_selection') return LAND_RE.test(text) && !DOCUMENT_RE.test(text);
  if (niche === 'buyer_education') return BUYER_RE.test(text) && !DOCUMENT_RE.test(text) && !LAND_RE.test(text);
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

  for (const candidate of ordered.slice(0, 12)) {
    let sourceNotes = null;
    try {
      sourceNotes = await extractYoutubeTranscript(candidate.source.url);
    } catch (err) {
      console.log(`${niche}: transcript error for ${candidate.source.id}: ${err.message}`);
    }
    if (!sourceNotes) {
      console.log(`${niche}: skipping ${candidate.source.id}; source-video analysis unavailable`);
      continue;
    }
    if (!sourceMatchesNiche(niche, candidate, sourceNotes)) {
      console.log(`${niche}: skipping ${candidate.source.id}; subject belongs to another brand lane`);
      continue;
    }

    const contentId = makeContentId(niche);
    const pack = await generateNicheContentPack({
      ...candidate,
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

    // Second guard after Gemini generation. This prevents a SafeBuy source from
    // drifting into a Builders topic such as waterproofing/electrical/plumbing.
    if (!packMatchesNiche(niche, pack)) {
      console.log(`${niche}: rejected generated pack ${contentId}; generated subject belongs to another brand lane`);
      continue;
    }

    const record = {
      contentId,
      niche,
      label: meta.label,
      brand: meta.brand,
      brandLabel: meta.brandLabel,
      status: 'awaiting_video',
      createdAt: new Date().toISOString(),
      candidate,
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
      ...candidate,
      niche,
      contentId,
      brandLabel: meta.brandLabel,
      nicheLabel: meta.label
    }, pack);
    console.log(`${niche}: source-video-backed ${meta.brandLabel} prompt sent to Telegram as ${contentId}`);
    return true;
  }

  console.log(`${niche}: no correctly routed source-video-backed candidate found`);
  return false;
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
