# Eduvidual → Todoist Sync

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Netlify](https://img.shields.io/badge/Netlify-Edge%20Functions-00C7B7.svg)](https://netlify.com)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](./LICENSE)

> **Heads up: Password in URL**
> The status page passes your password as a URL query parameter (`?pwd=...`). Query params can appear in server logs - but since this is a personal tool and only you can see those logs, it's a deliberate tradeoff for simplicity. The password only unlocks the debug view anyway.

Tired of manually checking Moodle for deadlines? This tool pulls your Eduvidual calendar feed every hour, grabs your upcoming assignments, shifts each deadline 24 hours earlier, and adds them to Todoist - all automatically. Set it up once and forget about it.

## Features

- **No secrets in code**: API keys, calendar URLs, and passwords all live in environment variables. The repo is fully public and safe to share.
- **Auto-sync every 3 hours**: A GitHub Actions cron job fires every 3 hours and triggers the sync - no manual intervention needed.
- **No duplicate tasks**: Each assignment is tracked by its unique iCal ID. The same task will never appear in Todoist twice, even across multiple syncs.
- **Built-in 24h buffer**: Every deadline is shifted back by exactly 24 hours - because "due tomorrow" is already cutting it close.

## Setup & Deployment

### 1. Get your Eduvidual iCal link

1. Log into [Eduvidual](https://www.eduvidual.at/).
2. Go to the **Calendar** tab.
3. Scroll to the bottom and click **Export calendar**.
4. Choose **All events** and your preferred timeframe (e.g. **recent and next 60 days**).
5. Click **Get calendar URL** and copy the link.

### 2. Get your Todoist API token

1. Log into [Todoist](https://todoist.com/).
2. Go to **Settings** (top-left avatar) → **Integrations** → **Developer**.
3. Copy your **API token**.

### 3. Deploy to Netlify

Click the button below - it'll fork this repo to your GitHub and set up the Netlify project automatically.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/allmightychaos/eduvidual-to-todoist)

During setup you'll be asked for:
- `EDUVIDUAL_ICAL_URL` - the calendar URL from Step 1
- `TODOIST_API_TOKEN` - the API token from Step 2

### 4. Add the GitHub Actions secret

The cron job that triggers the sync needs your `STATUS_PASSWORD` to authenticate with the endpoint. Without this, every scheduled run will fail with a 401.

1. Go to your forked repo on GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret**.
3. Name: `STATUS_PASSWORD`, Value: the same password you set in Netlify.

### 5. Optional configuration

#### Sync to a specific Todoist project

By default, tasks land in your Todoist Inbox. To route them to a specific project instead, add a `TODOIST_PROJECT_ID` environment variable in your Netlify dashboard. To find the project ID:

1. Open the project in the Todoist web app.
2. Look at the URL: `todoist.com/app/project/myproject-YOUR_PROJECT_ID`
3. Copy just the alphanumeric part at the end (e.g. `YOUR_PROJECT_ID`) - not the project name prefix.

#### Lock down the status page

The status dashboard is public, but error details are hidden from anyone who doesn't know the password. Set a `STATUS_PASSWORD` environment variable in Netlify to enable the debug view - it shows full error logs, raw sync data, and a Force Sync button to trigger a manual run.
