# OliveTree event-driven Telegram publishing

This Worker copies the proven Coimbatore Property Monitor trigger pattern into the multi-brand realestate-content-engine.

## Live flow

1. Telegram calls the Cloudflare Worker webhook immediately when a message arrives.
2. A copied VIDEO ID such as `INV-20260911-AB12`, `DOC-20260911-CD34`, `LAND-20260911-EF56`, `CON-20260911-GH78`, or `BUY-20260911-IJ90` is held in KV for 15 minutes.
3. The next MP4 is paired to that exact ID. The ID can also be included directly in the MP4 caption.
4. Duplicate Telegram updates are blocked in KV for 24 hours.
5. The Worker sends a GitHub `repository_dispatch` event named `telegram-content-upload` immediately.
6. `.github/workflows/telegram-publisher.yml` receives the exact Telegram update and publishes to the brand routed by `config/niches.json`.
7. The generated video is staged in R2 and then sent to the correct YouTube and Instagram credentials.
8. YouTube and Instagram progress are stored separately, so retrying does not duplicate a platform that already succeeded.
9. Telegram receives start, success, partial-failure, or error feedback.

## Target

Normal target: publishing starts immediately and completes in roughly 1–3 minutes.
Operational target: complete within 10 minutes after the MP4 is uploaded to Telegram, subject to YouTube/Meta API response time.

## Required Cloudflare Worker configuration

Create a KV namespace and replace `REPLACE_WITH_KV_NAMESPACE_ID` in `wrangler.toml`.

Set these Worker secrets/variables:

- `WEBHOOK_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `GITHUB_TOKEN`
- `GITHUB_REPOSITORY` is already set to `britsingh20-source/realestate-content-engine`

The GitHub token used by the Worker should be a fine-grained token with access only to this repository and permission to trigger repository dispatch / Actions.

## Deploy

```bash
cd cloudflare/telegram-ingest
npx wrangler kv namespace create PAIRING_STATE
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

After deploy, register the Telegram webhook using the deployed Worker URL and the same `WEBHOOK_SECRET`:

```bash
curl --request POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  --data-urlencode "url=https://<worker-domain>/telegram/<WEBHOOK_SECRET>" \
  --data-urlencode 'allowed_updates=["message"]' \
  --data-urlencode "drop_pending_updates=false"
```

## Test sequence

1. Copy the VIDEO ID from the Telegram prompt.
2. Send only the VIDEO ID to the bot.
3. Confirm Telegram replies `VIDEO ID saved`.
4. Upload the generated MP4 within 15 minutes.
5. Confirm Telegram replies that social publishing has started.
6. Confirm YouTube and Instagram publish status is returned.

The ID may also be put directly in the MP4 caption, in which case step 2 is not required.
