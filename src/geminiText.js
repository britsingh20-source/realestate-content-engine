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

  const peerSummary = candidate.peerMatches.slice(0, 4).map(p => ({
    creator: p.creator,
    title: p.title,
    outlier: Number(p.outlier.toFixed(2)),
    similarity: Number(p.similarity.toFixed(2))
  }));

  const sourceDescription = String(candidate.source.description || '').slice(0, 1200);
  const instruction = `You are the intelligence layer for OliveTree Investors, an original Indian real-estate Shorts brand.\n\nNICHE: ${candidate.niche}\nCONTENT ID: ${candidate.contentId || 'pending'}\n\nResearch input comes from YouTube breakout signals. Do NOT copy source wording, script, sequence, examples, thumbnails, or distinctive creative expression. Extract only the underlying topic, audience question, useful facts signaled by the title/description, and presentation mechanism. Then create a fresh OliveTree Investors treatment.\n\nCreate ONE production-ready Gemini video prompt for a 30-45 second Tamil-first Reel/Short. It must be visually understandable on mute, useful to ordinary viewers, and strongly visual rather than presenter-heavy.\n\nReturn STRICT JSON with these keys: topic, why_it_is_working, original_angle, source_takeaway, hook_options (exactly 5), selected_hook, voiceover_tamil, voiceover_english_summary, scenes (array of 7-10 objects with seconds, visual, on_screen_text, purpose), gemini_video_prompt, title_tamil, caption_tamil, hashtags.\n\nThe gemini_video_prompt must itself be ready to paste directly into Gemini and must include: true portrait 9:16; premium realistic Indian/Tamil Nadu environment; powerful first 1.5 seconds; new visual information every 2-3 seconds; clear graphical comparisons/maps/cutaways/3D diagrams where useful; no generic luxury montage; no continuous presenter; no gimbal/camera operator; no random people blocking the shot; no religious markings added by AI; minimal readable text; no black bars; no landscape framing; no invented guarantees; label hypothetical financial examples as illustrative.\n\nSOURCE BREAKOUT SIGNAL:\nCreator: ${candidate.creator}\nYouTube URL: ${candidate.source.url}\nTitle: ${candidate.source.title}\nDescription excerpt: ${sourceDescription}\nPerformance vs creator baseline: ${candidate.source.outlier.toFixed(2)}x\nViral score: ${candidate.viralScore}/100\nPeer confirmations: ${candidate.confirmations}\nPeer signals: ${JSON.stringify(peerSummary)}\n`;

  let lastError = null;
  for (const model of models.slice(0, 6)) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: instruction }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.75 }
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        if (!text) throw new Error('Gemini returned no text');
        return JSON.parse(text);
      }
      const body = await res.text();
      lastError = new Error(`Gemini ${model} ${res.status}: ${body}`);
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
      await sleep(attempt * 5000);
    }
  }
  throw lastError || new Error('Gemini generation failed');
}
