import { schedule } from '@netlify/functions';

export const handler = schedule("0 * * * *", async (event) => {
    try {
        console.log("Sync started...");
        
        return { statusCode: 200 };
    } catch (error) {
        console.error("Error during sync:", error);
        return { statusCode: 500 };
    }
});
