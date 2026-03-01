// Temporary test file — checks if the iCal fetch works from a Netlify Function.
// Delete this once confirmed working.

export default async (_req: Request) => {
    const icalUrl = Netlify.env.get("EDUVIDUAL_ICAL_URL");

    if (!icalUrl) {
        return new Response(JSON.stringify({ error: "EDUVIDUAL_ICAL_URL not set" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    const start = Date.now();
    try {
        const res = await fetch(icalUrl, {
            signal: AbortSignal.timeout(30000),
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; CalendarSync/1.0)",
                "Accept": "text/calendar, text/plain, */*",
            },
        });
        const elapsed = Date.now() - start;
        const text = await res.text();
        return new Response(JSON.stringify({
            status: res.status,
            elapsed_ms: elapsed,
            bytes: text.length,
            preview: text.slice(0, 100),
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (err) {
        const elapsed = Date.now() - start;
        const msg = err instanceof Error ? err.message : String(err);
        const cause = (err as any)?.cause;
        const causeMsg = cause instanceof Error
            ? `${cause.constructor.name}: ${cause.message}`
            : cause != null ? String(cause) : undefined;
        return new Response(JSON.stringify({ error: msg, cause: causeMsg, elapsed_ms: elapsed }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
