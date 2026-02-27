# Eduvidual (Moodle) to Todoist Sync

Automate your student life! This project is a Netlify Scheduled Function that fetches your Eduvidual (Moodle) calendar, shifts the deadlines 24 hours earlier (so you don't do it at the last minute), and pushes them securely to Todoist.

## Features
- **Zero Data Exposure**: No hardcoded API keys or personal URLs. Everything is securely managed via Environment Variables.
- **Hourly Sync**: Runs automatically every hour.
- **Deduplication**: Checks your active tasks to ensure duplicate assignments aren't created.
- **Proactive Deadlines**: Automatically shifts Moodle deadlines 24 hours backwards.
