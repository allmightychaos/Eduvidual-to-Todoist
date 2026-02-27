import { runSync } from '../utils/sync-core';

export default async (req: Request) => {
    const url = new URL(req.url);
    const password = url.searchParams.get("pwd");
    const correctPassword = process.env.STATUS_PASSWORD;

    if (!correctPassword || password !== correctPassword) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
            status: 401,
            headers: { "Content-Type": "application/json" }
        });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), { 
            status: 405,
            headers: { "Content-Type": "application/json" }
        });
    }

    return await runSync();
};