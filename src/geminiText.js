function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function generateContentPack(candidate) {
  const apiKey = required('GEMINI_API_KEY');
  const model = required('GEMINI_TEXT_MODEL');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  const peerSummary = candidate.peerMatches.slice(0, 4).map(p => ({
    creator: p.creator,
    title: p.title,
    outlier: Number(p.outlier.toFixed(2)),
    similarity: Number(p.similarity.toFixed(2))
  }));

  const instruction = `You are the intelligence layer for an original Indian real-estate Shorts channel.\n\nSOURCE SIGNAL ONLY — do not copy wording, sequence, script, examples, or distinctive creative expression from source creators. Use only the underlying topic and audience-interest signal. Independently frame a fresh educational angle.\n\nCreate a 30-45 second Tamil-first social video concept that is visually understandable even on mute and attractive to ordinary viewers, not only property buyers.\n\nReturn STRICT JSON with these keys: topic, why_it_is_working, original_angle, hook_options (exactly 5), selected_hook, voiceover_tamil, voiceover_english_summary, scenes (array of 7-10 objects with seconds, visual, on_screen_text, purpose), gemini_video_prompt, title_tamil, caption_tamil, hashtags.\n\nThe Gemini video prompt must enforce: portrait 9:16, premium hyper-real Indian/Tamil Nadu environment, powerful first 1.5 seconds, new visual information every 2-3 seconds, cinematic real footage blended with clean 3D diagrams/visual metaphors, no generic luxury montage, no continuous presenter, minimal text, no black bars, no landscape framing.\n\nSource breakout:\nCreator: ${candidate.creator}\nTitle: ${candidate.source.title}\nPerformance vs creator baseline: ${candidate.source.outlier.toFixed(2)}x\nViral score: ${candidate.viralScore}/100\nPeer confirmations: ${candidate.confirmations}\nPeer signals: ${JSON.stringify(peerSummary)}\n`;

  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: instruction }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.8 }
    })
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini returned no text');
  return JSON.parse(text);
}
