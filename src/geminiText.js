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

  const instruction = `You create original social-video concepts for OliveTree Investors. The final audience is Coimbatore, Tamil Nadu only.\n\nCONTENT ID: ${candidate.contentId}\nSOURCE CREATOR: ${candidate.creator}\nSOURCE URL: ${candidate.source.url}\nSOURCE TITLE: ${candidate.source.title}\nSOURCE PERFORMANCE: ${candidate.source.outlier.toFixed(2)}x creator baseline\n\nACTUAL SOURCE TRANSCRIPT/CAPTIONS:\n${transcript}\n\nTASK:\n1. Read the actual source transcript closely and identify the real hook, core argument, mechanism, examples, warnings and takeaway.\n2. Do NOT copy the source wording, sentence order, script, examples, sequence, thumbnail idea or distinctive expression. Use only the educational mechanism and audience-interest signal.\n3. Rebuild it as an ORIGINAL Coimbatore-focused property-investment lesson for OliveTree Investors. Final content must be about Coimbatore only.\n4. Never invent Coimbatore locality facts, project claims, infrastructure announcements, prices, appreciation percentages, returns, timelines, legal claims or distances. If a specific Coimbatore fact is not verified in the input, convert the lesson into a general Coimbatore investment principle/checklist rather than pretending a local claim is true.\n5. Tamil-first voice-over. All visual directions in clear English.\n6. FINAL VIDEO LENGTH IS EXACTLY 10 SECONDS. Never ask Gemini for 20, 30, 35 or 40 seconds.\n7. Use EXACTLY 7 fast scenes/shots within those 10 seconds. Each scene roughly 1.0-1.6 seconds. The voice-over must be concise enough to naturally fit in 10 seconds.\n8. PRIMARY VISUAL STYLE IS PHOTOREALISTIC, LIVE-ACTION-STYLE REAL PROPERTY FOOTAGE. The result must feel like real land-development footage shot in Coimbatore/Tamil Nadu: real roads, plotted layouts, vacant residential land, villas, houses, construction activity, streetlights, EB poles, vehicles, natural vegetation, commercial/residential surroundings and realistic human activity only when useful.\n9. At least 90% of the video must look like real camera/drone footage. Do NOT generate toon animation, cartoon people, illustrated cityscapes, flat 2D explainer scenes, infographic-only scenes, white-background explainers, glossy corporate motion-graphics scenes, game-like 3D renders or futuristic cities.\n10. Motion graphics are allowed ONLY as subtle overlays on top of photorealistic footage: short labels, arrows, a brief comparison line, location marker, simple highlight or transparent map overlay. Never make motion graphics the main scene.\n11. Scene 1 must be a strong real-world visual hook in the first 1.5 seconds. Scene 7 must ALSO be a real-world visual scene, not a full-screen branded end card. A small takeaway text or minimal OliveTree Investors branding may sit over that real final shot.\n12. Strict portrait 9:16. No landscape framing, black bars or blurred sidebars.\n13. No visible gimbal/cameraman. No random person entering or blocking the frame. No religious symbols/markings added by AI. No fake Chennai/Mumbai/Bengaluru landmarks. No guaranteed appreciation/returns.\n14. Keep on-screen text extremely short because AI-generated text can distort. Prefer 1-4 words per overlay.\n15. Exactly 3 hashtags.\n\nRETURN STRICT JSON with keys:\ntopic, source_script_insight, coimbatore_angle, core_takeaway, voiceover_tamil, scenes, gemini_video_prompt, title_tamil, caption_tamil, hashtags.\n\nSCENES must be an array of EXACTLY 7 objects with keys: scene, start_sec, end_sec, purpose, visual, on_screen_text, voiceover_tamil. Scene times must cover 0.0 through 10.0 seconds without exceeding 10 seconds.\n\ngemini_video_prompt MUST be the full ready-to-paste Gemini prompt. It must explicitly state: EXACTLY 10 seconds, EXACTLY 7 scenes, portrait 9:16, OLIVETREE INVESTORS, COIMBATORE ONLY, PHOTOREALISTIC LIVE-ACTION-STYLE REAL PROPERTY FOOTAGE, at least 90% real-looking visuals, no toon/cartoon/explainer-animation style, motion graphics only as subtle overlays, and scene 7 must be a real closing scene instead of a full-screen end card. Embed all 7 scene visuals, concise Tamil voice-over and minimal on-screen text directly inside that prompt.`;

  let lastError = null;
  for (const model of models.slice(0, 6)) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: instruction }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.35 }
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
