import { schedule } from '@netlify/functions';

export const handler = schedule("0 * * * *", async (event) => {
    console.log("Sync started...");
    return { statusCode: 200 };
});
