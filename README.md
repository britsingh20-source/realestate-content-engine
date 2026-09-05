# realestate-content-engine

Multi-channel real-estate Shorts intelligence, Gemini prompt generation and social publishing project.

## Five niches
- Property Investment
- Property Legal & Documents
- Smart Land Buyer / Land Selection
- Construction Knowledge
- Property Buyer Education

Each niche monitors five source creators. New uploads alone do not generate content. The engine detects creator-level breakouts, validates the underlying topic against the other creators in that niche, then produces an original angle and a highly visual Gemini 9:16 prompt.

## Pipeline
Source monitor -> creator baseline -> breakout detector -> cross-creator validation -> topic confidence -> fact verification -> hook competition -> visual story engine -> Gemini prompt -> Telegram -> generated video upload -> social publishing -> performance feedback.

## Pilot
Build and validate the Property Investment niche first. Once stable, reuse the engine for the other four niches.

See `docs/PIPELINE.md` and `prompts/visual_master.md`.
