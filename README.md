# Eduvidual → Todoist Sync

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020.svg)](https://workers.cloudflare.com/)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](./LICENSE)

Tired of manually checking Eduvidual for deadlines? This tool pulls your Eduvidual calendar feed every 3 hours, grabs your upcoming assignments, shifts each deadline 24 hours earlier, and adds them to Todoist - all automatically, running on Cloudflare Workers. Set it up once and forget about it.

> **Note:** All calendar events are automatically shifted 24 hours earlier when added to Todoist. A deadline on Friday becomes a task due Thursday. Customizable shift duration is planned for a **future update**.

---

![Deadliner Preview](/docs/deadliner.png)

---

## Features

- **One platform only**: Runs entirely on Cloudflare.
- **No secrets in code**: API keys and passwords live in Cloudflare secrets.
- **Auto-sync every 3 hours**: Driven by a Cloudflare cron trigger.
- **Force Sync button**: The status dashboard lets you trigger a sync on demand.
- **No duplicate tasks**: Each assignment is tracked by its unique iCal ID. The same task will never appear in Todoist twice.
- **Built-in 24h buffer**: Every deadline is shifted back by exactly 24 hours.

## Setup

### 1. Get your Eduvidual iCal link

1. Log into [Eduvidual](https://www.eduvidual.at/).
2. Go to the **Calendar** tab.
3. Scroll to the bottom and click **Export calendar**.
4. Choose **All events** and your preferred timeframe (e.g. **recent and next 60 days**).
5. Click **Get calendar URL** and copy the link.

### 2. Get your Todoist API token

1. Log into [Todoist](https://todoist.com/).
2. Go to **Settings** - **Integrations** - **Developer**.
3. Copy your **API token**.

### 3. Deploy

```bash
git clone https://github.com/allmightychaos/Eduvidual-to-Todoist.git
cd Eduvidual-to-Todoist
npm install --ignore-scripts
npx wrangler login
npm run setup

npx wrangler secret put EDUVIDUAL_ICAL_URL
npx wrangler secret put TODOIST_API_TOKEN

npx wrangler deploy
```

### 4. Optional secrets

```bash
# Route tasks to a specific Todoist project instead of Inbox
# Find the ID at the end of the project URL: todoist.com/app/project/myproject-YOUR_PROJECT_ID
npx wrangler secret put TODOIST_PROJECT_ID

# Password-protect the error details on the status dashboard
npx wrangler secret put STATUS_PASSWORD
```

## Local development

```bash
cp .env.example .dev.vars   # fill in your secrets
npm run dev                  # starts wrangler dev server
```

## How it works

The Worker has two entry points:

- **`scheduled()`** - runs every 3 hours via cron trigger, calls `runSync()`
- **`fetch()`** - handles HTTP requests:
  - `GET /api/status` - returns latest sync state from KV
  - `POST /api/sync` - runs sync immediately (auth-gated if `STATUS_PASSWORD` is set)
  - Everything else - served from `public/` as static assets

State is stored in Cloudflare KV under two keys:
- `"latest"` - `{ timestamp, status }` of the most recent sync
- `"processed-events"` - array of already-synced iCal UIDs (prevents duplicates)

---

<div align="center">

| Stats | Value |
|---|---|
| Total lines of code | 687 |
| Worker bundle size | 6.97 KB (2.50 KB gzip) |

</div>

---

<p align="center">Made with ❤️ by Chaos <em>(with the help of Claude ;)</em></p>
