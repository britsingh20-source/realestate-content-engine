# OliveTree event-driven Telegram publishing

This Worker mirrors the Coimbatore Property Monitor trigger pattern for the multi-brand realestate-content-engine.

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

## Publishing target

- Normal target: 1–3 minutes after MP4 upload.
- Operational target: under 10 minutes, subject to YouTube/Meta API response time.

## Required Worker bindings

### KV

Create one KV namespace and bind it as:

- `PAIRING_STATE`

Replace `REPLACE_WITH_KV_NAMESPACE_ID` in `wrangler.toml` with the created namespace ID.

### Existing values that are reused

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

These do not need to be regenerated. The same values already used by the project are copied into the Cloudflare Worker secrets/variables.

### Worker-only secret values

- `WEBHOOK_SECRET` — private random path secret used only for the Telegram webhook URL.
- `GITHUB_DISPATCH_TOKEN` — repository-scoped GitHub token used only to send the `telegram-content-upload` repository dispatch.

`GITHUB_REPOSITORY` is already configured as `britsingh20-source/realestate-content-engine`.

## Deploy

```bash
cd cloudflare/telegram-ingest
npx wrangler kv namespace create PAIRING_STATE
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put GITHUB_DISPATCH_TOKEN
npx wrangler deploy
```

After deploy, register Telegram to the Worker URL:

```bash
curl --request POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  --data-urlencode "url=https://<worker-domain>/telegram/<WEBHOOK_SECRET>" \
  --data-urlencode 'allowed_updates=["message"]' \
  --data-urlencode "drop_pending_updates=false"
```

## Test sequence

1. Copy the VIDEO ID from the Telegram prompt.
2. Send only the VIDEO ID to the bot, or place it directly in the MP4 caption.
3. If sent separately, confirm Telegram replies `VIDEO ID saved`.
4. Upload the generated MP4 within 15 minutes.
5. Confirm Telegram replies that social publishing has started.
6. Confirm YouTube and Instagram status is returned.

## Brand routing

- `INV-*` and `BUY-*` → OliveTree Investors
- `DOC-*` and `LAND-*` → OliveTree SafeBuy
- `CON-*` → OliveTree Builders

The social credentials for each brand remain isolated by the prefixes already defined in `config/niches.json`.
