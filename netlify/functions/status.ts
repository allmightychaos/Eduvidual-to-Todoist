import { getStore } from "@netlify/blobs";

export const handler = async () => {
    try {
        const store = getStore("sync-state");
        const data = await store.get("latest", { type: "json" });

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify(data || { timestamp: null, status: "unknown" }),
        };
    } catch (error) {
        console.error("Failed to fetch status:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ timestamp: null, status: "error" }),
        };
    }
};
