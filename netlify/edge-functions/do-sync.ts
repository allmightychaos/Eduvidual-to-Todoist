import type { Config } from "@netlify/edge-functions";
import { getStore } from "@netlify/blobs";

// ─── iCal parser ─────────────────────────────────────────────────────────────

/** Undo iCal line-folding (CRLF/LF + whitespace = continuation) */
function unfold(text: string): string {
    return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

/** Extract a single property value, ignoring any parameters (e.g. DTEND;TZID=...:value) */
function getProp(block: string, key: string): string | null {
    const match = block.match(new RegExp(`^${key}(?:;[^:]*)?:(.+)$`, "im"));
    return match ? match[1].trim() : null;
}

/** Unescape iCal text values */
function unescapeVal(val: string): string {
    return val
        .replace(/\\n/g, "\n")
        .replace(/\\,/g, ",")
        .replace(/\\;/g, ";")
        .replace(/\\\\/g, "\\");
}

interface ParsedDate {
    iso: string;
    isAllDay: boolean;
}

function parseIcalDate(raw: string): ParsedDate {
    const s = raw.trim();
    if (!s.includes("T")) {
        // All-day: YYYYMMDD
        return {
            iso: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
            isAllDay: true,
        };
    }
    // Timed: YYYYMMDDTHHmmss[Z] - treat as UTC
    return {
        iso: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`,
        isAllDay: false,
    };
}

interface VEvent {
    uid: string;
    summary: string;
    end: ParsedDate;
    url: string | null;
    description: string | null;
}

function parseEvents(icalText: string): VEvent[] {
    const text = unfold(icalText);
    const events: VEvent[] = [];

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

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    const store = getStore("sync-state");
    const timestamp = new Date().toISOString();

    try {
        const icalUrl = Netlify.env.get("EDUVIDUAL_ICAL_URL");
        const todoistToken = Netlify.env.get("TODOIST_API_TOKEN");
        const projectId = Netlify.env.get("TODOIST_PROJECT_ID");

        if (!icalUrl || !todoistToken) {
            await store.setJSON("latest", { timestamp, status: "error: missing env vars" });
            return new Response(JSON.stringify({ error: "missing env vars" }), { status: 500 });
        }

        // 1. Fetch iCal
        console.log("Fetching iCal feed...");
        const icalRes = await fetch(icalUrl, {
            signal: AbortSignal.timeout(15000),
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; CalendarSync/1.0)",
                "Accept": "text/calendar, text/plain, */*",
            },
        });

        if (!icalRes.ok) {
            const msg = `iCal fetch failed with HTTP ${icalRes.status}`;
            await store.setJSON("latest", { timestamp, status: `error: ${msg}` });
            return new Response(JSON.stringify({ error: msg }), { status: 502 });
        }

        const icalText = await icalRes.text();

        // 2. Parse events
        const events = parseEvents(icalText);
        console.log(`Parsed ${events.length} events`);

        // 3. Load already-processed UIDs
        let processedIds: string[] = [];
        try {
            const stored = await store.get("processed-events", { type: "json" });
            if (Array.isArray(stored)) processedIds = stored;
        } catch {
            console.log("No existing processed-events, starting fresh.");
        }
        const processedSet = new Set(processedIds);

        // 4. Create Todoist tasks for new, future events
        const now = new Date();
        let created = 0;

        for (const event of events) {
            const original = new Date(event.end.iso);
            if (original < now) continue;               // skip past events
            if (processedSet.has(event.uid)) continue;  // skip already synced

            // Shift deadline 24h earlier
            const shifted = new Date(original.getTime() - 24 * 60 * 60 * 1000);

            const description = [
                event.description ?? "",
                event.url ? `🔗 ${event.url}` : "",
            ].filter(Boolean).join("\n\n");

            const body: Record<string, string> = {
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
                signal: AbortSignal.timeout(8000),
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
                console.error(`Failed to create "${event.summary}": ${taskRes.status} - ${errBody}`);
            }
        }

        await store.setJSON("latest", { timestamp, status: "success" });
        console.log(`Sync complete. Tasks created: ${created}`);

        return new Response(JSON.stringify({ ok: true, created }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Sync error:", msg);
        await store.setJSON("latest", { timestamp, status: `error: ${msg}` });
        return new Response(JSON.stringify({ error: msg }), { status: 500 });
    }
}

export const config: Config = {
    path: "/do-sync",
};
