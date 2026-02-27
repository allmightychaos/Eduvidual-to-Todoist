import { getStore } from "@netlify/blobs";

export default async (req: Request) => {
    try {
        const url = new URL(req.url);
        const password = url.searchParams.get("pwd");
        const correctPassword = process.env.STATUS_PASSWORD;

        const isAuthenticated = Boolean(correctPassword && password === correctPassword);

        const store = getStore("sync-state");
        type SyncStateData = { timestamp?: string | null; status?: string; message?: string; isAuthenticated?: boolean };
        let data: SyncStateData | null = null;
        
        try {
            data = await store.get("latest", { type: "json" }) as SyncStateData;
        } catch (e: unknown) {
            console.error("Blob error:", e);
            data = null;
        }

        if (!data) {
            return new Response(JSON.stringify({ timestamp: null, status: "unknown", isAuthenticated }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        const responseData = { ...data };

        if (responseData.status && responseData.status.includes("error") && !isAuthenticated) {
            responseData.status = "error";
            responseData.message = "Authentication required to view error details.";
        }

        responseData.isAuthenticated = isAuthenticated;

        return new Response(JSON.stringify(responseData), {
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            },
        });
    } catch (error: unknown) {
        console.error("Outer error:", error);
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        return new Response(JSON.stringify({ timestamp: null, status: "error", message: errorMessage, isAuthenticated: false }), {
            status: 500,
            headers: { 
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate"
            },
        });
    }
};
