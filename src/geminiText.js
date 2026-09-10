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

  const instruction = `You create original social-video concepts for OliveTree Investors. The final audience is Coimbatore, Tamil Nadu only.\n\nCONTENT ID: ${candidate.contentId}\nSOURCE CREATOR: ${candidate.creator}\nSOURCE URL: ${candidate.source.url}\nSOURCE TITLE: ${candidate.source.title}\nSOURCE PERFORMANCE: ${candidate.source.outlier.toFixed(2)}x creator baseline\n\nACTUAL SOURCE TRANSCRIPT/CAPTIONS:\n${transcript}\n\nTASK:\n1. Read the actual source transcript closely and identify the real hook, core argument, mechanism, examples, warnings and takeaway.\n2. Do NOT copy the source wording, sentence order, script, examples, sequence, thumbnail idea or distinctive expression. Use only the educational mechanism and audience-interest signal.\n3. Rebuild it as an ORIGINAL Coimbatore-focused property-investment lesson for OliveTree Investors. Final content must be about Coimbatore only.\n4. Never invent Coimbatore locality facts, project claims, infrastructure announcements, prices, appreciation percentages, returns, timelines, legal claims or distances. If a specific Coimbatore fact is not verified in the input, convert the lesson into a general Coimbatore investment principle/checklist rather than pretending a local claim is true.\n5. Tamil-first voice-over. All visual directions in clear English.\n6. FINAL VIDEO LENGTH IS EXACTLY 10 SECONDS. Never ask Gemini for 20, 30, 35 or 40 seconds.\n7. Use EXACTLY 7 fast scenes/shots within those 10 seconds. Each scene roughly 1.0-1.6 seconds. The total Tamil voice-over must be short enough to be spoken naturally in approximately 10 seconds.\n8. SUBJECT-FIRST VISUAL RULE: classify the source lesson before writing scenes. Choose the main subject from: market timing, cash flow/rental yield, loan/EMI, legal risk, location selection, infrastructure impact, negotiation, resale/liquidity, land measurement/access, construction quality, buyer psychology, portfolio strategy, or another precise subject stated in the source. The seven visuals must demonstrate THAT subject's mechanism. Do not begin with a preselected property montage.\n9. PRIMARY VISUAL STYLE IS ULTRA-PHOTOREALISTIC REAL-WORLD FOOTAGE. Use the physical objects that naturally prove the subject: for example documents and survey stones for title/access risk; traffic and commute decisions for connectivity; occupied versus vacant units for rental demand; bank statement/EMI context for leverage; water flow, drainage and road level for site risk; buyer visits and time-on-market cues for liquidity. These are examples, not a compulsory checklist.\n10. FORBIDDEN DEFAULT STORY: do not automatically show empty plot -> developed layout -> completed house -> family entering -> construction -> end card. A plot, villa, family, buyer or worker may appear only when directly necessary to explain a transcript-derived point. Never use a generic happy-family payoff. Never show house construction as a generic symbol of investment growth.\n11. VISUAL EVIDENCE MAPPING: first extract 3-5 concrete claims/mechanisms from the source notes. Every scene must map to one of them and must declare its evidence_point. At least 5 of 7 scenes must be impossible to reuse unchanged for a different topic. If the same seven scenes could illustrate any property-investment video, redesign them.\n12. COIMBATORE ADAPTATION: localize setting, architecture, road character, climate and buyer context to Coimbatore/Tamil Nadu, but do not change the source subject into a generic 'buy land in Coimbatore' message. Coimbatore is the setting and application layer; the transcript's exact educational subject remains the backbone.\n13. REALISM DETAIL IS MANDATORY: natural sunlight, realistic sky exposure, subtle atmospheric haze, correct shadows, physically plausible reflections, authentic materials, natural vegetation movement, believable scale and perspective, stable geometry, realistic human proportions, no plastic CGI surfaces or fantasy grading.\n14. CAMERA LANGUAGE IS MANDATORY: match camera treatment to the evidence. Use macro/close detail when inspecting a document, crack, measurement or material; eye-level observation for human decisions; static comparison for before/after; restrained drone only when geography or access is the actual point. Do not use a drone merely for visual decoration. No impossible wall fly-through, 360 orbit, teleport morph, fisheye, whip pan, speed ramp or zoom burst.\n15. Realistic inserts such as a phone calculator, map route, document highlight, measurement tape, occupancy board or simple chart may occupy the frame when the subject requires them. Graphics must remain restrained and legible; no cartoon explainer style.\n16. Scene 1 must visualize the source's central tension within 1.3 seconds—not merely show land or a house. Scene 7 must deliver the subject-specific proof/payoff in a real setting. Do NOT use a separate branded end card. Minimal OliveTree Investors text may sit over the final scene.\n17. Strict native portrait 9:16. Compose all shots vertically from the beginning. No landscape source inside a portrait canvas, no black bars, no blurred sidebars, no rotated landscape composition.\n18. Keep people secondary. Never show a presenter talking to camera unless specifically necessary. No random person entering frame, no visible cameraman/gimbal, no uncanny faces, no duplicated people.\n19. Do not add religious symbols, ceremonial markings or invented signboards. Do not show fake Chennai/Mumbai/Bengaluru landmarks. Do not fabricate Coimbatore landmarks.\n20. Keep on-screen text extremely short, preferably 1-3 words, because generated text may distort. Branding must be minimal.\n21. Exactly 3 hashtags.\n22. Do not reuse one visual narrative across unrelated topics. Vary the opening device, camera grammar, central physical evidence and final payoff according to the source subject.\n\nRETURN STRICT JSON with keys:\nsubject_classification, source_evidence_points, topic, source_script_insight, coimbatore_angle, visual_strategy, generic_sequence_avoided, core_takeaway, voiceover_tamil, scenes, gemini_video_prompt, title_tamil, caption_tamil, hashtags.\n\nsubject_classification must name one precise subject, not merely 'property investment'. source_evidence_points must contain 3-5 concise points actually supported by the source notes. visual_strategy must explain why this video's physical evidence and camera grammar are specific to that subject. generic_sequence_avoided must be true.\n\nSCENES must be an array of EXACTLY 7 objects with keys: scene, start_sec, end_sec, evidence_point, purpose, visual, on_screen_text, voiceover_tamil. Scene times must cover 0.0 through 10.0 seconds without exceeding 10 seconds.\n\nMOST IMPORTANT — GEMINI VIDEO PROMPT DETAIL LEVEL:\ngemini_video_prompt must be a LONG, highly detailed, production-ready prompt comparable in specificity to a professional property walkthrough prompt. Target roughly 3000-5500 characters. Do not compress it into one short paragraph. Structure it with clear headings and line breaks. It must be self-contained and ready to paste directly into Gemini.\n\nThe gemini_video_prompt MUST include all of the following sections:\nA. MANDATORY OUTPUT FORMAT LOCK — exactly 10 seconds, native portrait 9:16, full-screen vertical composition.\nB. REALISM LOCK — state repeatedly that this is photorealistic physical-world footage, not animation/render/cartoon/explainer. Describe only the Tamil Nadu/Coimbatore environments, objects, materials and human activity relevant to this exact subject.\nC. SOURCE SUBJECT LOCK — state the precise transcript-derived subject, list the 3-5 source evidence points, and explain the Coimbatore application without turning it into generic land promotion.\nD. SUBJECT-SPECIFIC VISUAL STRATEGY — state which physical evidence, opening device, camera grammar and payoff make this concept unique to the chosen subject; explicitly state that the default empty-plot/house/family/construction sequence is forbidden unless an individual element is essential to a source-derived point.\nE. CAMERA + IMAGE QUALITY — realistic smartphone/mirrorless/drone footage, stabilized movement, natural focal lengths, exposure, depth, shadows, textures, 4K-like clarity, stable geometry, no CGI look.\nF. EXACT 7-SHOT PLAN — give timestamps for every scene and, for EACH shot, specify location type, subject, foreground, background, camera height, movement, framing, lighting, what physical details must be visible, tiny overlay text and the exact concise Tamil VO segment.\nG. MOTION-GRAPHICS LIMIT — only subtle overlays on real footage, never a graphic-dominant scene.\nH. FINAL REAL SCENE — no end card; finish on the strongest subject-specific real-world proof or decision moment, with only a small takeaway/brand overlay.\nI. NEGATIVE PROMPT / FIXED RULES — explicitly ban toon/cartoon/anime, 2D/3D explainer graphics, architectural visualization, game-engine render, plastic CGI look, fake skyline, floating buildings, morphing roads/buildings, distorted text, duplicated people, visible camera crew, religious markings, fake landmarks, landscape framing, black bars, repeated shots and unrealistic camera motion.\n\nThe gemini_video_prompt MUST explicitly state OLIVETREE INVESTORS and COIMBATORE ONLY. Embed all 7 scenes, every visual direction, minimal text overlay and all Tamil VO pieces directly inside it. The result should be detailed enough that Gemini has very little room to reinterpret the video as an animated explainer.`;

  let lastError = null;
  for (const model of models.slice(0, 6)) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: instruction }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.45 }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        if (!text) throw new Error('Gemini returned no text');
        const pack = JSON.parse(text);
        if (!pack.gemini_video_prompt) throw new Error('Gemini omitted gemini_video_prompt');
        if (!pack.subject_classification || String(pack.subject_classification).trim().toLowerCase() === 'property investment') throw new Error('Gemini did not identify a precise source subject');
        if (!Array.isArray(pack.source_evidence_points) || pack.source_evidence_points.length < 3) throw new Error('Gemini omitted transcript-derived evidence points');
        if (pack.generic_sequence_avoided !== true) throw new Error('Gemini did not confirm avoidance of the generic visual sequence');
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
