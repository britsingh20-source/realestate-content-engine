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
  const names = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''));
  const flash = names.filter(n => /flash/i.test(n)).sort((a, b) => versionScore(b) - versionScore(a));
  const others = names.filter(n => !/flash/i.test(n)).sort((a, b) => versionScore(b) - versionScore(a));
  return [...flash, ...others];
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

export async function extractYoutubeTranscript(url) {
  const apiKey = required('GEMINI_API_KEY');
  const models = await modelCandidates(apiKey);
  const instruction = `Watch and listen to this public YouTube real-estate video carefully. Produce faithful SOURCE NOTES for an editorial research system. Do not reproduce the full transcript verbatim and do not copy the creator's wording. Instead capture, in detail, what is actually said and shown:\n- opening hook and first claim\n- main argument/mechanism\n- examples and comparisons actually used\n- any numbers, places, warnings or caveats actually stated\n- chronological point-by-point flow\n- closing takeaway/CTA\n- visible presentation mechanisms (maps, charts, before/after, presenter, footage, text overlays) when observable\n\nIMPORTANT: Distinguish clearly between facts stated in the video and your interpretation. Do not add external facts. Return compact plain text research notes, about 800-1800 words maximum. These notes will be transformed into a new original Coimbatore-focused video later.`;

  let lastError = null;
  for (const model of models.slice(0, 6)) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { file_data: { file_uri: url } },
              { text: instruction }
            ]
          }],
          generationConfig: { temperature: 0.15 }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
        if (text.length >= 120) {
          return {
            text,
            subtitleFile: 'gemini-youtube-video-understanding',
            chars: text.length,
            model,
            method: 'gemini_youtube_url'
          };
        }
        lastError = new Error(`Gemini ${model} returned insufficient YouTube analysis`);
        break;
      }
      const body = await res.text();
      lastError = new Error(`Gemini YouTube analysis ${model} ${res.status}: ${body}`);
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
      await sleep(attempt * 5000);
    }
  }
  console.warn(`YouTube video understanding unavailable for ${url}: ${lastError?.message || 'unknown error'}`);
  return null;
}
