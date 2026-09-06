# Instagram Keyword → CRM Lead Automation

## Goal

At the end of each property Reel, use one locality keyword:

- KARAMADAI
- SARAVANAMPATTI
- KALAPATTI
- VADAVALLI
- SULUR
- KOVILPALAYAM
- ANNUR
- METTUPALAYAM
- MALUMICHAMPATTI

Example CTA:

> Looking for a property in Karamadai? Comment **KARAMADAI** below or DM us **KARAMADAI** and we will send matching properties privately.

## Flow

1. Viewer comments or DMs the locality keyword on Instagram.
2. Instagram sends the event to the webhook endpoint.
3. `src/leads/instagramWebhook.js` parses comments and DMs.
4. `src/leads/keywordRouter.js` normalizes spelling and matches aliases.
5. A CRM lead record is created with source, locality, Reel/media ID and assigned telecaller.
6. The user gets a private Instagram response asking for budget and property type.
7. Existing CRM logic can continue qualification, WhatsApp handoff and site-visit tracking.

## CRM payload

```json
{
  "leadKey": "instagram:<instagram-user-id>",
  "source": "instagram",
  "sourceType": "comment",
  "instagramSenderId": "...",
  "instagramUsername": "...",
  "incomingText": "Karamadai",
  "localityKeyword": "KARAMADAI",
  "interestedArea": "Karamadai",
  "assignedTelecaller": "telecaller-2",
  "campaignId": "<reel-media-id>",
  "instagramMediaId": "<reel-media-id>",
  "instagramCommentId": "<comment-id>",
  "status": "NEW_KEYWORD_LEAD"
}
```

The CRM receiver should upsert on `leadKey`. Do not create a second customer record every time the same Instagram user comments again. Instead append the new enquiry/campaign to that customer's history.

## Required environment variables

```text
INSTAGRAM_IG_USER_ID=
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=
CRM_LEAD_WEBHOOK_URL=
CRM_LEAD_WEBHOOK_TOKEN=
META_GRAPH_VERSION=
```

`META_GRAPH_VERSION` should be set to the current Graph API version configured for the Meta app. The code keeps it configurable so a Meta API version upgrade does not require application logic changes.

## Meta app subscriptions / permissions

Use an Instagram Professional account and configure the Meta app for the Instagram API. Subscribe the webhook to Instagram comment and messaging events needed by the selected Instagram login mode. The access token must include the appropriate comment-management and message-management permissions for that mode.

For comment-triggered private replies, Meta allows one private reply to the commenter and requires it to be sent within the permitted comment reply window. Further messages are only available after the person replies, subject to Meta's messaging window.

## Recommended lead states

```text
NEW_KEYWORD_LEAD
AWAITING_REQUIREMENT
QUALIFIED
TELECALLER_ASSIGNED
CONTACTED
SITE_VISIT_PLANNED
SITE_VISIT_DONE
HOT
WARM
COLD
NOT_INTERESTED
BOOKED
```

## Recommended qualification sequence

First private reply:

> Thanks! We have noted your interest in Karamadai. Please reply here with your budget and whether you are looking for a Plot, Villa or Independent House. We will send matching properties privately.

After the person replies, capture:

1. Budget
2. Property type
3. Buying timeline
4. Phone number / WhatsApp consent where appropriate
5. Site-visit interest

## Important privacy rule

Do not route these prospects into one large normal WhatsApp group. Keep qualification private. Use a WhatsApp Channel for broadcast updates and one-to-one WhatsApp for sales follow-up.
