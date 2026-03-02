// ─── Types ────────────────────────────────────────────────────────────────────

interface Env {
    SYNC_STATE: KVNamespace;
    ASSETS: Fetcher;
    EDUVIDUAL_ICAL_URL: string;
    TODOIST_API_TOKEN: string;
    TODOIST_PROJECT_ID?: string;
    STATUS_PASSWORD?: string;
}

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

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(request: Request, env: Env): boolean {
    if (!env.STATUS_PASSWORD) return true;
    const auth = request.headers.get("Authorization") ?? "";
    return auth === `Bearer ${env.STATUS_PASSWORD}`;
}

// ─── Core sync logic ──────────────────────────────────────────────────────────

async function runSync(env: Env): Promise<{ created: number }> {
    const timestamp = new Date().toISOString();

    if (!env.EDUVIDUAL_ICAL_URL || !env.TODOIST_API_TOKEN) {
        await env.SYNC_STATE.put("latest", JSON.stringify({ timestamp, status: "error: missing env vars" }));
        throw new Error("missing env vars");
    }

    // 1. Fetch iCal
    const icalRes = await fetch(env.EDUVIDUAL_ICAL_URL, {
        signal: AbortSignal.timeout(25000),
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; CalendarSync/1.0)",
            "Accept": "text/calendar, text/plain, */*",
        },
    });

    if (!icalRes.ok) {
        const msg = `iCal fetch failed with HTTP ${icalRes.status}`;
        await env.SYNC_STATE.put("latest", JSON.stringify({ timestamp, status: `error: ${msg}` }));
        throw new Error(msg);
    }

    const icalText = await icalRes.text();

    // 2. Parse events
    const events = parseEvents(icalText);

    // 3. Load already-processed UIDs
    let processedIds: string[] = [];
    try {
        const stored = await env.SYNC_STATE.get("processed-events", { type: "json" });
        if (Array.isArray(stored)) processedIds = stored;
    } catch {
        // No existing processed-events, starting fresh
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
            event.url ? `\uD83D\uDD17 ${event.url}` : "",
        ].filter(Boolean).join("\n\n");

        const body: Record<string, string> = {
            content: event.summary,
            description,
        };
        if (env.TODOIST_PROJECT_ID) body.project_id = env.TODOIST_PROJECT_ID;
        if (event.end.isAllDay) {
            body.due_date = shifted.toISOString().split("T")[0];
        } else {
            body.due_datetime = shifted.toISOString();
        }

        const taskRes = await fetch("https://api.todoist.com/api/v1/tasks", {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: {
                Authorization: `Bearer ${env.TODOIST_API_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });

        if (taskRes.ok) {
            processedSet.add(event.uid);
            await env.SYNC_STATE.put("processed-events", JSON.stringify(Array.from(processedSet)));
            created++;
        } else {
            const errBody = await taskRes.text();
            console.error(`Failed to create "${event.summary}": ${taskRes.status} - ${errBody}`);
        }
    }

    await env.SYNC_STATE.put("latest", JSON.stringify({ timestamp, status: "success" }));
    return { created };
}

// ─── Request handlers ─────────────────────────────────────────────────────────

async function handleStatus(request: Request, env: Env): Promise<Response> {
    const auth = isAuthorized(request, env);

    type SyncState = { timestamp?: string | null; status?: string; message?: string; isAuthenticated?: boolean };
    let data: SyncState | null = null;

    try {
        data = await env.SYNC_STATE.get("latest", { type: "json" });
    } catch {
        // KV read failed
    }

    if (!data) {
        return Response.json(
            { timestamp: null, status: "unknown", isAuthenticated: auth },
            { headers: { "Cache-Control": "no-store" } },
        );
    }

    const responseData = { ...data };

    if (responseData.status?.includes("error") && !auth) {
        responseData.status = "error";
        responseData.message = "Authentication required to view error details.";
    }

    responseData.isAuthenticated = auth;

    return Response.json(responseData, {
        headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    });
}

async function handleSync(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json", "Allow": "POST" },
        });
    }

    if (!isAuthorized(request, env)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const result = await runSync(env);
        return Response.json({ ok: true, ...result });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Sync error:", msg);
        return new Response(JSON.stringify({ error: "Sync failed. Check Cloudflare logs for details." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}

// ─── Worker exports ───────────────────────────────────────────────────────────

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/api/status") {
            return handleStatus(request, env);
        }

        if (url.pathname === "/api/sync") {
            return handleSync(request, env);
        }

        return env.ASSETS.fetch(request);
    },

    async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(runSync(env).catch(console.error));
    },
};
