function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function versionScore(name) {
  const m = String(name).match(/gemini-(\d+)(?:\.(\d+))?/i);
  return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0;
}

async function modelCandidates(apiKey) {
  if (process.env.GEMINI_TEXT_MODEL) return [process.env.GEMINI_TEXT_MODEL];
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error(`Gemini model list ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const models = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''));
  const flash = models.filter(n => /flash/i.test(n)).sort((a, b) => versionScore(b) - versionScore(a));
  const others = models.filter(n => !/flash/i.test(n)).sort((a, b) => versionScore(b) - versionScore(a));
  const ordered = [...flash, ...others];
  if (!ordered.length) throw new Error('No Gemini generateContent model available');
  return ordered;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export async function generateContentPack(candidate) {
  const apiKey = required('GEMINI_API_KEY');
  const models = await modelCandidates(apiKey);
  const transcript = String(candidate.transcript || '').slice(0, 14000);
  if (transcript.length < 120) throw new Error('Transcript is required for Investors content generation');

  const instruction = `You create original social-video concepts for OliveTree Investors. The final audience is Coimbatore, Tamil Nadu only.\n\nCONTENT ID: ${candidate.contentId}\nSOURCE CREATOR: ${candidate.creator}\nSOURCE URL: ${candidate.source.url}\nSOURCE TITLE: ${candidate.source.title}\nSOURCE PERFORMANCE: ${candidate.source.outlier.toFixed(2)}x creator baseline\n\nACTUAL SOURCE TRANSCRIPT/CAPTIONS:\n${transcript}\n\nTASK:\n1. Read the actual source transcript closely and identify the real hook, core argument, mechanism, examples, warnings and takeaway.\n2. Do NOT copy the source wording, sentence order, script, examples, sequence, thumbnail idea or distinctive expression. Use only the educational mechanism and audience-interest signal.\n3. Rebuild it as an ORIGINAL Coimbatore-focused property-investment lesson for OliveTree Investors. Final content must be about Coimbatore only.\n4. Never invent Coimbatore locality facts, project claims, infrastructure announcements, prices, appreciation percentages, returns, timelines, legal claims or distances. If a specific Coimbatore fact is not verified in the input, convert the lesson into a general Coimbatore investment principle/checklist rather than pretending a local claim is true.\n5. Tamil-first voice-over. All visual directions in clear English.\n6. FINAL VIDEO LENGTH IS EXACTLY 10 SECONDS. Never ask Gemini for 20, 30, 35 or 40 seconds.\n7. Use EXACTLY 7 fast scenes/shots within those 10 seconds. Each scene roughly 1.0-1.6 seconds. The total Tamil voice-over must be short enough to be spoken naturally in approximately 10 seconds.\n8. PRIMARY VISUAL STYLE IS ULTRA-PHOTOREALISTIC REAL-WORLD PROPERTY FOOTAGE. The result must feel like genuine footage physically recorded in Coimbatore/Tamil Nadu using a modern smartphone, mirrorless camera, stabilized handheld rig or low drone. It must NOT resemble a cartoon, toon animation, animated explainer, architectural render, game engine, glossy corporate animation, stock illustration, miniature model or motion-graphics reel.\n9. At least 95% of every frame must be realistic physical-world imagery. Show believable South Indian land development: real asphalt/tar roads, red/brown soil, plotted sites, concrete boundary stones, compound walls, EB poles and wires, streetlights, drainage edges, coconut/neem vegetation, ordinary villas and houses, genuine construction materials, workers only when naturally appropriate, parked two-wheelers/cars, small shops or mixed residential edges when suitable.\n10. REALISM DETAIL IS MANDATORY: natural sunlight, realistic sky exposure, subtle atmospheric haze, correct shadows, physically plausible reflections, authentic concrete/brick/soil/asphalt textures, natural vegetation movement, believable vehicle scale, correct perspective, stable building geometry, realistic human proportions, no plastic CGI surfaces, no hyper-saturated fantasy grading.\n11. CAMERA LANGUAGE IS MANDATORY: describe for every shot the camera height, movement and framing. Prefer low drone glide, eye-level stabilized walk, slow lateral tracking, forward push, or static-to-gentle reveal. No impossible flying through walls, no orbiting 360-degree camera, no teleport morph, no fisheye distortion, no whip pan, no speed ramp, no zoom burst. Use natural 24-35 mm equivalent field of view unless a closer detail needs 50 mm equivalent.\n12. Motion graphics are allowed ONLY as tiny restrained overlays on top of real footage: one short label, arrow, transparent highlight or comparison marker. Never use a full-screen graphic, animated icon scene, cartoon map, 3D diagram, whiteboard graphic or text-only frame.\n13. Scene 1 must be a visually strong real-world hook within the first 1.3 seconds. Scene 7 must ALSO be a real-world property/development scene. Do NOT use a separate branded end card. Minimal OliveTree Investors text may sit over the final real scene.\n14. Strict native portrait 9:16. Compose all shots vertically from the beginning. No landscape source inside a portrait canvas, no black bars, no blurred sidebars, no rotated landscape composition.\n15. Keep people secondary. Never show a presenter talking to camera unless specifically necessary. No random person entering frame, no visible cameraman/gimbal, no uncanny faces, no duplicated people.\n16. Do not add religious symbols, ceremonial markings or invented signboards. Do not show fake Chennai/Mumbai/Bengaluru landmarks. Do not fabricate Coimbatore landmarks.\n17. Keep on-screen text extremely short, preferably 1-3 words, because generated text may distort. Branding must be minimal.\n18. Exactly 3 hashtags.\n\nRETURN STRICT JSON with keys:\ntopic, source_script_insight, coimbatore_angle, core_takeaway, voiceover_tamil, scenes, gemini_video_prompt, title_tamil, caption_tamil, hashtags.\n\nSCENES must be an array of EXACTLY 7 objects with keys: scene, start_sec, end_sec, purpose, visual, on_screen_text, voiceover_tamil. Scene times must cover 0.0 through 10.0 seconds without exceeding 10 seconds.\n\nMOST IMPORTANT — GEMINI VIDEO PROMPT DETAIL LEVEL:\ngemini_video_prompt must be a LONG, highly detailed, production-ready prompt comparable in specificity to a professional property walkthrough prompt. Target roughly 3000-5500 characters. Do not compress it into one short paragraph. Structure it with clear headings and line breaks. It must be self-contained and ready to paste directly into Gemini.\n\nThe gemini_video_prompt MUST include all of the following sections:\nA. MANDATORY OUTPUT FORMAT LOCK — exactly 10 seconds, native portrait 9:16, full-screen vertical composition.\nB. REALISM LOCK — state repeatedly that this is photorealistic physical-world footage, not animation/render/cartoon/explainer. Describe Tamil Nadu/Coimbatore environmental realism, materials, light, road surface, soil, vegetation, utilities and architecture.\nC. CONTENT INTENT — explain the investment lesson derived from the source mechanism without copying the source.\nD. CAMERA + IMAGE QUALITY — realistic smartphone/mirrorless/drone footage, stabilized movement, natural focal lengths, exposure, depth, shadows, textures, 4K-like clarity, stable geometry, no CGI look.\nE. EXACT 7-SHOT PLAN — give timestamps for every scene and, for EACH shot, specify location type, subject, foreground, background, camera height, movement, framing, lighting, what physical details must be visible, tiny overlay text and the exact concise Tamil VO segment.\nF. MOTION-GRAPHICS LIMIT — only subtle overlays on real footage, never a graphic-dominant scene.\nG. FINAL REAL SCENE — no end card; finish on a strong believable development/land/road/villa scene with only a small takeaway/brand overlay.\nH. NEGATIVE PROMPT / FIXED RULES — explicitly ban toon/cartoon/anime, 2D/3D explainer graphics, architectural visualization, game-engine render, plastic CGI look, fake skyline, floating buildings, morphing roads/buildings, distorted text, duplicated people, visible camera crew, religious markings, fake landmarks, landscape framing, black bars, repeated shots and unrealistic camera motion.\n\nThe gemini_video_prompt MUST explicitly state OLIVETREE INVESTORS and COIMBATORE ONLY. Embed all 7 scenes, every visual direction, minimal text overlay and all Tamil VO pieces directly inside it. The result should be detailed enough that Gemini has very little room to reinterpret the video as an animated explainer.`;

  let lastError = null;
  for (const model of models.slice(0, 6)) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: instruction }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        if (!text) throw new Error('Gemini returned no text');
        const pack = JSON.parse(text);
        if (!pack.gemini_video_prompt) throw new Error('Gemini omitted gemini_video_prompt');
        if (!Array.isArray(pack.scenes) || pack.scenes.length !== 7) throw new Error('Gemini must return exactly 7 scenes');
        if (!Array.isArray(pack.hashtags) || pack.hashtags.length !== 3) throw new Error('Gemini must return exactly 3 hashtags');
        if (String(pack.gemini_video_prompt).length < 2200) throw new Error('Gemini video prompt is not detailed enough');
        return pack;
      }
      const body = await res.text();
      lastError = new Error(`Gemini ${model} ${res.status}: ${body}`);
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
      await sleep(attempt * 5000);
    }
  }
  throw lastError || new Error('Gemini generation failed');
}
