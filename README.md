# Eduvidual (Moodle) to Todoist Sync

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Netlify](https://img.shields.io/badge/Netlify-Scheduled%20Functions-00C7B7.svg)](https://netlify.com)
[![node-ical](https://img.shields.io/badge/node--ical-0.25-green.svg)](https://github.com/jens-maus/node-ical)
[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](./LICENSE)

A serverless automation tool that fetches your Eduvidual (Moodle) calendar feed, parses your assignments, automatically shifts their deadlines backward by 24 hours (so you actually get them done on time!), and seamlessly syncs them to your Todoist workspace.

## Features
- **Zero Data Exposure**: No hardcoded API keys or personal URLs. All configuration is handled dynamically via Environment Variables and Netlify Blobs.
- **Hourly Cron Sync**: Leverages Netlify Scheduled Functions to automatically poll the `.ics` feed every hour.
- **Strict Deduplication**: Queries active Todoist tasks before insertion to guarantee duplicate assignments are never created.
- **Proactive Time-Shifting**: Subtracts exactly 24 hours from the Moodle assignment due date to encourage earlier workflow completion.

## Setup & Deployment Instructions

### 1. Retrieve the Eduvidual iCal Link
1. Log into your [Eduvidual (Moodle) Account](https://www.eduvidual.at/).
2. Navigate to the **Calendar** tab.
3. Scroll to the bottom and select **Export calendar**.
4. Configure the export to include **All events** and your preferred timeframe (e.g. **recent and next 60 days**).
5. Click **Get calendar URL** and copy the resulting `export_execute.php` link.

### 2. Generate a Todoist API Token
1. Log into [Todoist](https://todoist.com/) in your browser.
2. Open your account settings (top left avatar) > **Integrations** > **Developer**.
3. Generate and copy your **API token**.

### 3. Deploy to Netlify
Deploying will automatically clone this repository to your GitHub account and set up the serverless environment.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/allmightychaos/eduvidual-to-todoist)

During deployment, Netlify will request the following environment variables:
- `EDUVIDUAL_ICAL_URL`: The URL generated in Step 1.
- `TODOIST_API_TOKEN`: The API token generated in Step 2.

### 4. Advanced Configuration (Optional)

#### Specify a Custom Todoist Project
By default, the script syncs tasks to your global Todoist Inbox. If you want tasks routed to a specific project folder, add a `TODOIST_PROJECT_ID` environment variable in your Netlify dashboard. To find the project ID:
1. Open the project in the Todoist Web App.
2. Look at the URL in your browser. It should look like: `todoist.com/app/project/myproject-YOUR_PROJECT_ID`.
3. Copy ONLY the alphanumeric hash at the end (e.g., `YOUR_PROJECT_ID`) and set it as `TODOIST_PROJECT_ID`. Do not include the project name prefix.

#### Secure the Status Page
The deployment includes a public-facing HTML status dashboard. By default, exact error traces are hidden from the public. To view detailed stack traces and runtime information, set a `STATUS_PASSWORD` environment variable in Netlify. You can then authenticate at the bottom of the status page.

> [!WARNING]
> ### 🛑 SECURITY DISCLAIMER: Password in URL
> 
> The status page authentication currently sends the password via a URL query parameter (`?pwd=...`). 
> 
> While this is generally considered a security risk because query parameters can be recorded in server access logs (like Netlify's edge logs), **it is intentionally left this way for simplicity.** 
> 
> Since this tool is designed for personal use, the only person who can see these logs is you. Furthermore, the password only grants access to view debug logs on the status dashboard, not to modify tasks or access your Todoist account in any way.
