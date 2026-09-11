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
  return [...flash, ...others];
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function nicheRules(niche) {
  if (niche === 'documentation' || niche === 'land_selection') {
    return {
      brand: 'OliveTree SafeBuy',
      purpose: 'property documentation, legal-risk awareness and smart land-selection education',
      visualWorld: 'real document desks, sale deeds, EC-style paperwork, approval drawings, survey sketches, boundary stones, measuring tape, site inspection, access roads, plotted land, drainage, EB poles, nearby construction and realistic Coimbatore/Tamil Nadu surroundings',
      cautions: 'Do not state a legal conclusion unless explicitly supported by the source. Do not invent approval status, survey numbers, patta status, EC results, road ownership, setbacks, FSI, guideline value, litigation status or government records. Frame uncertain legal points as checks a buyer should verify with qualified professionals and official records.'
    };
  }
  if (niche === 'construction') {
    return {
      brand: 'OliveTree Builders',
      purpose: 'practical residential construction education',
      visualWorld: 'real active construction sites, footing excavation, reinforcement steel, shuttering, concrete pours, brick/block masonry, curing, plumbing and electrical conduits, waterproofing, roof slab, plastering, tile work, material inspection, workers using normal tools and realistic Coimbatore/Tamil Nadu site conditions',
      cautions: 'Do not invent structural sizes, steel diameters, concrete grades, mix ratios, curing days, load capacities, waterproofing specifications, cost figures or code requirements unless explicitly supported by the source. When technical values are not verified, explain the principle visually without fabricating numbers.'
    };
  }
  throw new Error(`Unsupported niche for niche generator: ${niche}`);
}

export async function generateNicheContentPack(candidate) {
  const apiKey = required('GEMINI_API_KEY');
  const models = await modelCandidates(apiKey);
  const transcript = String(candidate.transcript || '').slice(0, 14000);
  if (transcript.length < 120) throw new Error('Source-video notes are required');

  const rules = nicheRules(candidate.niche);
  const instruction = `You create original short-form video concepts for ${rules.brand}. Final audience: Coimbatore, Tamil Nadu only.\n\nCONTENT ID: ${candidate.contentId}\nNICHE: ${candidate.niche}\nSOURCE CREATOR: ${candidate.creator}\nSOURCE URL: ${candidate.source.url}\nSOURCE TITLE: ${candidate.source.title}\nSOURCE PERFORMANCE: ${candidate.source.outlier?.toFixed?.(2) || candidate.source.outlier || 0}x creator baseline\n\nACTUAL SOURCE-VIDEO NOTES:\n${transcript}\n\nMISSION:\nCreate an ORIGINAL Coimbatore-focused lesson about ${rules.purpose}. Understand the source hook, mechanism, warnings, examples and takeaway, but do not copy its wording, script sequence, examples, thumbnail, distinctive visuals or creative expression. Use only the underlying educational mechanism and audience-interest signal.\n\nFACT SAFETY:\n${rules.cautions}\nNever transplant another city's facts into Coimbatore. If a specific Coimbatore fact is not verified in the input, turn it into a practical Coimbatore checklist or inspection principle instead of pretending it is true.\n\nVIDEO FORMAT — MANDATORY:\n- EXACTLY 10 seconds total.\n- EXACTLY 7 distinct scenes, roughly 1.0–1.6 seconds each.\n- Native portrait 9:16 only. No landscape, no black bars, no blurred sidebars.\n- Tamil-first concise voice-over that can genuinely fit within 10 seconds.\n- At least 90% of the output must look like photorealistic live-action smartphone/gimbal/drone footage, not animation.\n- Real-world visual environment: ${rules.visualWorld}.\n- Motion graphics allowed only as tiny overlays over real footage: short labels, arrows, highlight boxes, measurement line, check mark, warning mark, or brief transparent diagram.\n- NO toon animation, cartoon, flat 2D explainer, white-background infographic, glossy corporate motion graphics, game-like 3D render, plastic CGI, fake futuristic city, floating documents, floating houses or impossible camera motion.\n- Natural Tamil Nadu daylight, physically believable textures, dust, road surfaces, masonry, paper, steel, concrete, shadows, vegetation and vehicles.\n- Avoid fake identifiable landmarks unless source/input verifies them.\n- No random presenter. No visible cameraman/gimbal. No religious symbols added by AI.\n- Scene 1 must be a strong real-world hook.\n- Scene 7 must remain a real visual scene with a takeaway overlay; never use a full-screen logo/end card.\n- Keep text overlays short, ideally 1–4 words.\n- SOCIAL METADATA: write title_english and caption_english in English only. They must match the exact lesson and payoff in this generated video. Use a strong specific title under 90 characters. Write a powerful 70–130 word caption with a compelling first line, practical value, a grounded Coimbatore application, and one concise brand call to action. Never add unsupported figures or claims.\n\nPROMPT DETAIL LEVEL:\nThe final gemini_video_prompt must be production-grade and comparable in detail to a professional shot list. Target about 3000–5500 characters. For EACH of the 7 scenes specify: exact timestamp, shot purpose, physical location/setting, foreground subject, background context, camera height/angle, lens feel, camera movement, lighting/time-of-day, realistic materials/textures, action occurring, tiny overlay text, and the exact concise Tamil voice-over fragment. Include continuity rules, realism rules, and a final NEGATIVE PROMPT section.\n\nRETURN STRICT JSON with keys:\ntopic, source_script_insight, coimbatore_angle, core_takeaway, voiceover_tamil, scenes, gemini_video_prompt, title_english, caption_english, title_tamil, caption_tamil, hashtags.\n\nSCENES: EXACTLY 7 objects with keys: scene, start_sec, end_sec, purpose, visual, camera, on_screen_text, voiceover_tamil. Times must cover 0.0 through 10.0 seconds.\n\ngemini_video_prompt must explicitly say ${rules.brand}, COIMBATORE ONLY, EXACTLY 10 SECONDS, EXACTLY 7 SCENES, PHOTOREALISTIC LIVE-ACTION-STYLE REAL FOOTAGE, 90%+ real-looking visuals, portrait 9:16, motion graphics only as overlays, and no toon/cartoon/explainer-animation style. End with a strong NEGATIVE PROMPT section.\n\nExactly 3 hashtags.`;

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
        if (!Array.isArray(pack.scenes) || pack.scenes.length !== 7) throw new Error('Gemini must return exactly 7 scenes');
        if (!Array.isArray(pack.hashtags) || pack.hashtags.length !== 3) throw new Error('Gemini must return exactly 3 hashtags');
        if (!String(pack.title_english || '').trim() || !String(pack.caption_english || '').trim()) throw new Error('Gemini omitted English social metadata');
        if (/[\u0B80-\u0BFF]/.test(`${pack.title_english} ${pack.caption_english}`)) throw new Error('English social metadata contains Tamil text');
        const prompt = String(pack.gemini_video_prompt || '').trim();
        if (prompt.length < 2200) throw new Error(`Gemini prompt too short: ${prompt.length} chars`);
        return pack;
      }
      const body = await res.text();
      lastError = new Error(`Gemini ${model} ${res.status}: ${body}`);
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
      await sleep(attempt * 5000);
    }
  }
  throw lastError || new Error('Gemini niche generation failed');
}
