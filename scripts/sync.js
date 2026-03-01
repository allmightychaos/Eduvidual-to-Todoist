// @ts-check
"use strict";

// Runs as a GitHub Actions job.
// Fetches the Eduvidual iCal feed, parses events, creates Todoist tasks
// for upcoming assignments, and updates Netlify Blobs with the sync status.

const { getStore } = require("@netlify/blobs");

// ─── iCal parser ─────────────────────────────────────────────────────────────

/** Undo iCal line-folding (CRLF/LF + whitespace = continuation) */
function unfold(text) {
    return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

/** Extract a single property value, ignoring parameters (e.g. DTEND;TZID=...:value) */
function getProp(block, key) {
    const match = block.match(new RegExp(`^${key}(?:;[^:]*)?:(.+)$`, "im"));
    return match ? match[1].trim() : null;
}

/** Unescape iCal text values */
function unescapeVal(val) {
    return val
        .replace(/\\n/g, "\n")
        .replace(/\\,/g, ",")
        .replace(/\\;/g, ";")
        .replace(/\\\\/g, "\\");
}

/** @returns {{ iso: string, isAllDay: boolean }} */
function parseIcalDate(raw) {
    const s = raw.trim();
    if (!s.includes("T")) {
        return {
            iso: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
            isAllDay: true,
        };
    }
    return {
        iso: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`,
        isAllDay: false,
    };
}

/** @returns {Array<{ uid: string, summary: string, end: { iso: string, isAllDay: boolean }, url: string|null, description: string|null }>} */
function parseEvents(icalText) {
    const text = unfold(icalText);
    const events = [];

    for (const block of text.split("BEGIN:VEVENT").slice(1)) {
        const content = block.slice(0, block.indexOf("END:VEVENT"));
        const uid = getProp(content, "UID");
        const summary = getProp(content, "SUMMARY");
        const dtend = getProp(content, "DTEND") ?? getProp(content, "DUE");

        if (!uid || !summary || !dtend) continue;

        const rawDesc = getProp(content, "DESCRIPTION");
        events.push({
            uid,
            summary: unescapeVal(summary),
            end: parseIcalDate(dtend),
            url: getProp(content, "URL"),
            description: rawDesc ? unescapeVal(rawDesc) : null,
        });
    }

    return events;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const icalUrl     = process.env.EDUVIDUAL_ICAL_URL;
    const todoistToken = process.env.TODOIST_API_TOKEN;
    const projectId   = process.env.TODOIST_PROJECT_ID;
    const siteId      = process.env.NETLIFY_SITE_ID;
    const authToken   = process.env.NETLIFY_AUTH_TOKEN;

    if (!icalUrl || !todoistToken || !siteId || !authToken) {
        console.error("Missing required env vars: EDUVIDUAL_ICAL_URL, TODOIST_API_TOKEN, NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN");
        process.exit(1);
    }

    const store = getStore({
        name: "sync-state",
        siteID: siteId,
        token: authToken,
    });

    const timestamp = new Date().toISOString();

    try {
        // 1. Fetch iCal
        console.log("Fetching iCal feed from Eduvidual...");
        const icalRes = await fetch(icalUrl, {
            signal: AbortSignal.timeout(30000),
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; CalendarSync/1.0)",
                "Accept": "text/calendar, text/plain, */*",
            },
        });

        if (!icalRes.ok) {
            throw new Error(`iCal fetch failed with HTTP ${icalRes.status}`);
        }

        const icalText = await icalRes.text();
        console.log(`Fetched ${icalText.length} bytes of iCal data.`);

        // 2. Parse events
        const events = parseEvents(icalText);
        console.log(`Parsed ${events.length} events.`);

        // 3. Load already-processed UIDs
        let processedIds = [];
        try {
            const stored = await store.get("processed-events", { type: "json" });
            if (Array.isArray(stored)) processedIds = stored;
        } catch {
            console.log("No existing processed-events found - starting fresh.");
        }
        const processedSet = new Set(processedIds);
        console.log(`Already processed: ${processedSet.size} events.`);

        // 4. Create Todoist tasks for new, future events
        const now = new Date();
        let created = 0;

        for (const event of events) {
            const original = new Date(event.end.iso);
            if (original < now) continue;               // skip past events
            if (processedSet.has(event.uid)) continue;  // skip already synced

            // Shift deadline 24 hours earlier
            const shifted = new Date(original.getTime() - 24 * 60 * 60 * 1000);

            const description = [
                event.description ?? "",
                event.url ? `Link: ${event.url}` : "",
            ].filter(Boolean).join("\n\n");

            /** @type {Record<string, string>} */
            const body = {
                content: event.summary,
                description,
            };
            if (projectId) body.project_id = projectId;
            if (event.end.isAllDay) {
                body.due_date = shifted.toISOString().split("T")[0];
            } else {
                body.due_datetime = shifted.toISOString();
            }

            const taskRes = await fetch("https://api.todoist.com/api/v1/tasks", {
                method: "POST",
                signal: AbortSignal.timeout(15000),
                headers: {
                    Authorization: `Bearer ${todoistToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });

            if (taskRes.ok) {
                processedSet.add(event.uid);
                await store.setJSON("processed-events", Array.from(processedSet));
                created++;
                console.log(`Created task: "${event.summary}"`);
            } else {
                const errBody = await taskRes.text();
                console.error(`Failed to create "${event.summary}": HTTP ${taskRes.status} - ${errBody}`);
            }
        }

        await store.setJSON("latest", { timestamp, status: "success" });
        console.log(`Sync complete. Tasks created: ${created}`);

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Sync error:", msg);
        try {
            await store.setJSON("latest", { timestamp, status: `error: ${msg}` });
        } catch (blobErr) {
            console.error("Failed to update Netlify Blob status:", blobErr);
        }
        process.exit(1);
    }
}

main();
