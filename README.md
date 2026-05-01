# Meeting BaaS Recorder for Twenty

Twenty app that schedules Meeting BaaS bots from synced calendar events, stores recordings in a custom `recording` object, and exposes a recording detail UI with transcript, summary, chat, and task actions.

## What It Does

- Adds a `recording` object, views, navigation, and recording detail page.
- Adds workspace-member settings for recording preference, bot name, and bot entry message.
- Schedules bots from `calendarEvent.created` and `calendarEvent.updated`.
- Retries deferred scheduling every 5 minutes with a cron-triggered drain.
- Handles Meeting BaaS webhooks for `bot.failed`, `bot.status_change`, and `bot.completed`.
- Optionally downloads video files into Twenty file storage.

## Requirements

- Node `^24.5.0`
- Yarn `4.13.0`
- A Twenty workspace with:
  - calendar sync enabled for users
  - application install/deploy access
  - a stable workspace URL reachable by Meeting BaaS
- A Meeting BaaS API key

Important: run this against a normal Twenty self-host or cloud workspace. Do not rely on `twenty-app-dev` / dev-mode for production-like calendar sync; recurring cron registration can differ there.

## Local Development

```bash
yarn install
yarn test
npx twenty build
```

Lint:

```bash
yarn lint
```

## Twenty CLI Setup

The deploy/update flow expects the Twenty CLI to be configured in `~/.twenty/config.json`.

Typical flow:

```bash
npx twenty login
npx twenty remote:list
```

If you use a non-default remote, export `TWENTY_REMOTE=<name>` before running the cleanup/update scripts.

## Install / Update

First deploy:

```bash
npx twenty deploy
npx twenty install
```

Update an existing install:

```bash
yarn update
```

`yarn update` runs:

1. `twenty deploy`
2. `node scripts/clean-viewfields.mjs`
3. `twenty install`

The cleanup step exists to avoid `viewField` uniqueness conflicts on updates.

## Required App Variables

After install, set these in Twenty under the app settings:

- `MEETING_BAAS_API_KEY`: required; used for bot scheduling and webhook verification.
- `WORKSPACE_WEBHOOK_BASE_URL`: required for self-hosted or custom domains; should be the public workspace base URL, for example `https://crm.example.com`.
- `RECORDING_PREFERENCE`: workspace default recording behavior.
- `STORE_RECORDINGS_LOCALLY`: `true` to download video files into Twenty storage, `false` to keep external links only.
- `AUTO_CREATE_CONTACTS`: whether unknown participants should become contacts.

## Runtime Notes

- New near-term events are queued immediately and may also be scheduled directly from the trigger path.
- Events more than 90 days out stay in `PENDING_SCHEDULE` until they enter the allowed scheduling window.
- Deferred items are retried by the `daily-schedule-pending` cron every 5 minutes.
- Meeting BaaS callbacks are expected at:

```text
<WORKSPACE_WEBHOOK_BASE_URL>/s/webhook/meeting-baas
```

- Recording video proxy links are served from:

```text
<WORKSPACE_WEBHOOK_BASE_URL>/s/recording-video?botId=...
```

## Main Entry Points

- App config: `src/application-config.ts`
- SDK exports: `src/index.ts`
- Event scheduling: `src/logic-functions/on-calendar-event-created.ts`
- Pending drain: `src/logic-functions/process-pending-schedules.ts`
- Webhook handling: `src/webhook-handler.ts`
- Recording detail UI: `src/front-components/recording-detail.front-component.tsx`

## Known Operational Caveats

- Update installs currently rely on metadata cleanup for some view-field conflicts.
- The manual “schedule existing meetings” UI processes events in batches and may require multiple runs on large workspaces.
- The app assumes Twenty cron jobs and calendar sync are functioning normally on the target workspace.
