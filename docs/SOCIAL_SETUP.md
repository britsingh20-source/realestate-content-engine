# Social Publishing Setup

The engine routes every generated content item to one of five niches using its CONTENT ID:

- INV = Property Investment
- DOC = Property Documentation & Legal
- LAND = Smart Land Selection
- CON = Construction Knowledge
- BUY = Property Buyer Education

## Telegram upload rule

When a Gemini video is ready, either:

1. Upload the video to the configured Telegram chat with the CONTENT ID as its caption, or
2. Reply directly to the original Telegram prompt message with the video.

The Telegram publisher runs every 5 minutes and resolves the niche from the CONTENT ID. It stages the video in Cloudflare R2, publishes it to the mapped YouTube channel and Instagram account, records the result, and ignores duplicate uploads after successful publishing.

## Required shared secrets

- YOUTUBE_API_KEY
- GEMINI_API_KEY
- GEMINI_TEXT_MODEL
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
- R2_ENDPOINT
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET
- R2_PUBLIC_BASE_URL
- YOUTUBE_CLIENT_ID
- YOUTUBE_CLIENT_SECRET
- META_GRAPH_VERSION (optional; defaults in code)

## YouTube account secrets

Each refresh token must be generated while logged into the matching YouTube channel and must include the youtube.upload OAuth scope.

- YOUTUBE_INVESTMENT_REFRESH_TOKEN
- YOUTUBE_DOCUMENTATION_REFRESH_TOKEN
- YOUTUBE_LAND_SELECTION_REFRESH_TOKEN
- YOUTUBE_CONSTRUCTION_REFRESH_TOKEN
- YOUTUBE_BUYER_EDUCATION_REFRESH_TOKEN

## Instagram account secrets

Each Instagram account must be an eligible professional account connected for Meta API publishing.

- INSTAGRAM_INVESTMENT_USER_ID
- INSTAGRAM_INVESTMENT_ACCESS_TOKEN
- INSTAGRAM_DOCUMENTATION_USER_ID
- INSTAGRAM_DOCUMENTATION_ACCESS_TOKEN
- INSTAGRAM_LAND_SELECTION_USER_ID
- INSTAGRAM_LAND_SELECTION_ACCESS_TOKEN
- INSTAGRAM_CONSTRUCTION_USER_ID
- INSTAGRAM_CONSTRUCTION_ACCESS_TOKEN
- INSTAGRAM_BUYER_EDUCATION_USER_ID
- INSTAGRAM_BUYER_EDUCATION_ACCESS_TOKEN

## Current schedules

- Source creator scanning: every 3 hours.
- Telegram video intake and publishing: every 5 minutes.

GitHub Actions schedules are not guaranteed to execute at the exact minute; they can be delayed during platform load.
