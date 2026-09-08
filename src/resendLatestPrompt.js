import fs from 'node:fs/promises';
import { sendContentPack } from './telegram.js';

function sceneBlock(scene, index) {
  const start = Number(scene.start_sec ?? 0).toFixed(1);
  const end = Number(scene.end_sec ?? 0).toFixed(1);
  const visual = String(scene.visual || '').trim();
  const text = String(scene.on_screen_text || '').trim();
  const vo = String(scene.voiceover_tamil || '').trim();
  const purpose = String(scene.purpose || '').trim();

  return `SCENE ${index + 1} — ${start} TO ${end} SECONDS${purpose ? ` — ${purpose.toUpperCase()}` : ''}
VISUAL: ${visual}
CAMERA: Treat this as genuine local real-estate footage. Use a physically plausible camera move only: short gimbal push, slow lateral track, low drone glide, or stable reveal depending on the scene. Keep vertical composition natural with straight geometry, realistic lens perspective, normal depth of field, and no floating or impossible camera movement.
REALISM: Show believable Coimbatore/Tamil Nadu materials and surroundings: real road texture, soil, plot stones, compound walls, EB poles/wires where appropriate, native vegetation, ordinary houses/construction, natural shadows, realistic traffic/activity only when needed. Avoid perfect CGI symmetry and over-polished architecture.
ON-SCREEN TEXT: ${text || 'No text'}${text ? ' — keep it small, clean, correctly spelled, and overlaid on the real footage only.' : ''}
TAMIL VOICEOVER: ${vo || 'No voiceover for this scene.'}
CUT: Hard cut cleanly to the next distinct real-world shot; do not morph objects or reuse the same angle.`;
}

function buildDetailedPrompt(record) {
  const pack = record.pack || {};
  const scenes = Array.isArray(pack.scenes) ? pack.scenes.slice(0, 7) : [];
  if (scenes.length !== 7) throw new Error('Latest saved pack does not contain exactly 7 scenes');

  const topic = String(pack.topic || 'Coimbatore property investment').trim();
  const angle = String(pack.coimbatore_angle || '').trim();
  const takeaway = String(pack.core_takeaway || '').trim();
  const sourceUrl = record?.candidate?.source?.url || '';

  const blocks = scenes.map(sceneBlock).join('\n\n');

  return `MANDATORY OUTPUT FORMAT LOCK — READ THIS FIRST
Generate ONE native PORTRAIT video only: EXACTLY 10 seconds, vertical 9:16, full-screen portrait composition. Do not generate landscape 16:9, square, rotated landscape, letterboxing, pillarboxing, or a horizontal clip placed inside a portrait canvas.

PROJECT
Brand: OLIVETREE INVESTORS
Audience/Geography: COIMBATORE, TAMIL NADU ONLY
Topic: ${topic}
Coimbatore angle: ${angle || 'Use the lesson only as a general Coimbatore investment principle; do not invent locality-specific facts.'}
Core takeaway: ${takeaway || 'Use a practical, non-guaranteed Coimbatore investment takeaway.'}
Research source for educational mechanism only: ${sourceUrl || 'Saved source research'}

IMPORTANT SOURCE-USE RULE
Use the source only to understand the underlying educational mechanism and audience-interest signal. Do NOT reproduce its wording, scene order, examples, script, thumbnail idea, city-specific claims, distinctive creative expression, or branded presentation. The final video must be an ORIGINAL Coimbatore-focused OliveTree Investors reel.

PHOTOREALISTIC REAL-WORLD VISUAL LOCK
The finished video must look like genuine live-action real-estate footage captured in and around Coimbatore, not an explainer animation. At least 90% of every frame must be realistic physical-world imagery. Show believable plotted land, actual-looking roads, developing residential streets, independent houses/villas, construction stages, boundary stones, drainage edges, streetlights, EB poles and cables, local vegetation, parked or moving two-wheelers/cars where natural, ordinary commercial/residential surroundings, and realistic human activity only when useful.

The image must have natural daylight or believable golden-hour light, correct shadows, non-plastic textures, realistic concrete/asphalt/soil/brick/paint surfaces, plausible scale, stable straight walls, correct doors/windows/vehicles, and normal Tamil Nadu streetscape density. It should resemble premium smartphone/gimbal or compact-drone footage shot by a professional Coimbatore real-estate videographer.

ABSOLUTELY DO NOT MAKE IT LOOK LIKE:
cartoon, toon animation, Pixar-like render, anime, illustration, 2D explainer, flat icons, white-background presentation, infographic-only reel, corporate motion-graphics video, game-engine city, glossy 3D architectural render, miniature model, fake futuristic skyline, surreal environment, plastic textures, floating camera, morphing buildings, distorted roads, impossible geometry, or stock-vector animation.

MOTION GRAPHICS RULE
Motion graphics are allowed only as restrained overlays ON TOP OF real footage: a short 1–4 word label, thin arrow, subtle highlight, small comparison marker, transparent location-style indicator, or simple line. Never replace a real scene with a graphic card. Never cover more than about 15% of the frame with graphics. No animated cartoon map, no giant icons, no spinning symbols, no full-screen end card.

CAMERA + EDITING RULES
Use EXACTLY 7 clearly different shots across the 10 seconds. Each shot must show new physical information. Use clean hard cuts. Keep camera movement short, controlled, and physically plausible. No whip pans, no zoom bursts, no speed ramps, no spinning, no drone dives, no impossible orbit, no morph transitions, no repeated shot, and no random person blocking the frame. Keep vertical safe areas clear for platform UI.

SCENE PLAN
${blocks}

FINAL-SCENE RULE
Scene 7 must remain a REAL closing shot of Coimbatore-style land development/property surroundings. It must NOT become a branded full-screen end card. If branding is used, show only a small subtle “OliveTree Investors” text overlay on the real scene. A practical takeaway line may appear briefly, but keep the real environment visible behind it.

AUDIO
Use concise Tamil voiceover exactly as supplied scene-by-scene. Keep delivery clear, confident, conversational, and fast enough to fit naturally within 10 seconds without sounding unnaturally sped up. Do not add exaggerated sales language, guaranteed returns, appreciation promises, or unverified location claims. Background music, if generated, should be subtle modern real-estate reel music and must not overpower speech.

TEXT QUALITY
All on-screen text must be minimal, correctly spelled, sharp, upright and stationary enough to read. If the generator cannot render text cleanly, prioritize the real visuals and omit the text rather than generating misspelled words.

GEOGRAPHY + SAFETY LOCK
Coimbatore/Tamil Nadu visual character only. Do not show Chennai, Mumbai, Bengaluru or foreign landmarks. Do not invent exact roads, projects, prices, appreciation percentages, returns, infrastructure announcements, legal approvals, distances or timelines unless explicitly verified in the supplied content. No religious symbols or ceremonial door markings. No visible cameraman, gimbal, tripod, microphone, filming crew, random presenter, or person staring into camera.

FINAL QUALITY CHECK BEFORE GENERATING
Confirm internally that the output is: EXACTLY 10 seconds; native 9:16 portrait; EXACTLY 7 distinct scenes; overwhelmingly photorealistic live-action-style real property footage; Coimbatore-only visual character; motion graphics only as tiny overlays; no toon/cartoon/explainer look; and scene 7 is a real physical-world closing shot, not an end card. Then generate the video.`;
}

async function main() {
  const raw = await fs.readFile('data/pending-content.json', 'utf8');
  const records = JSON.parse(raw);
  const latest = records.find(r => r.status === 'awaiting_video' && Array.isArray(r?.pack?.scenes) && r.pack.scenes.length === 7);
  if (!latest) throw new Error('No awaiting_video 7-scene Investors pack found to resend');

  const detailedPrompt = buildDetailedPrompt(latest);
  if (detailedPrompt.length < 3000) throw new Error(`Detailed prompt unexpectedly short: ${detailedPrompt.length}`);

  const candidate = {
    ...(latest.candidate || {}),
    contentId: latest.contentId,
    niche: latest.niche || 'investment'
  };

  const pack = {
    ...latest.pack,
    gemini_video_prompt: detailedPrompt
  };

  await sendContentPack(candidate, pack);
  console.log(`Resent DETAILED Gemini prompt to Telegram: ${latest.contentId} (${detailedPrompt.length} chars)`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
