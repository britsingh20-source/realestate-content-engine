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
  const models = (data.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''));
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

  const instruction = `You create original social-video concepts for OliveTree Investors. The final audience is Coimbatore, Tamil Nadu only.\n\nCONTENT ID: ${candidate.contentId}\nSOURCE CREATOR: ${candidate.creator}\nSOURCE URL: ${candidate.source.url}\nSOURCE TITLE: ${candidate.source.title}\nSOURCE PERFORMANCE: ${candidate.source.outlier.toFixed(2)}x creator baseline\n\nACTUAL SOURCE TRANSCRIPT/CAPTIONS:\n${transcript}\n\nTASK:\n1. Read the transcript closely and extract the actual hook, argument, examples, warnings, numbers, mechanism and takeaway.\n2. Do NOT copy wording, sequence, script, examples or distinctive expression. Use only the underlying educational mechanism and audience-interest signal.\n3. Rebuild it as an ORIGINAL Coimbatore-focused property-investment lesson for OliveTree Investors. The final video must talk about Coimbatore, not Chennai, Mumbai, Bengaluru or generic India.\n4. Do not invent Coimbatore locality facts, prices, infrastructure announcements, appreciation percentages, laws, distances, returns or project claims. If the source mechanism cannot be safely localized with known facts, frame it as a Coimbatore investment checklist/example rather than pretending a specific claim is true.\n5. Tamil-first voice-over, English visual directions.\n6. Strong graphical/visual explanation: maps, plotted land, road/access diagrams, comparison graphics, before/after, demand arrows, micro-market illustrations, checklists.\n7. True portrait 9:16. No black bars, no landscape frame, no gimbal/camera operator, no random people blocking frame, no religious markings, no fake landmarks, no guaranteed returns.\n8. 30-40 seconds, 7-9 scenes, new visual information every 2-3 seconds.\n9. Exactly 3 hashtags.\n10. Create ONE Telegram-ready production package, compact enough to fit one Telegram message.\n\nReturn STRICT JSON with keys:\ntopic, source_script_insight, coimbatore_angle, voiceover_tamil, scenes, gemini_video_prompt, title_tamil, caption_tamil, hashtags, telegram_prompt.\n\ntelegram_prompt MUST be one compact ready-to-copy package under 3200 characters and include: SOURCE URL, COIMBATORE ANGLE, FINAL GEMINI PROMPT with scene-by-scene visuals + Tamil voice-over embedded, TITLE, CAPTION, exactly 3 HASHTAGS, and UPLOAD instruction using CONTENT ID ${candidate.contentId}. The Gemini prompt must itself say OLIVETREE INVESTORS and COIMBATORE ONLY.`;

  let lastError = null;
  for (const model of models.slice(0, 6)) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
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
        if (!pack.telegram_prompt) throw new Error('Gemini omitted telegram_prompt');
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
