import { schedule } from '@netlify/functions';
import { TodoistApi } from '@doist/todoist-api-typescript';

export const handler = schedule("0 * * * *", async (event) => {
    try {
        console.log("Sync started...");
        const todoistToken = process.env.TODOIST_API_TOKEN;
        
        if (!todoistToken) {
            console.error("Missing TODOIST_API_TOKEN environment variable.");
            return { statusCode: 500 };
        }
        
        const todoist = new TodoistApi(todoistToken);
        console.log("Todoist API client initialized.");
        
        return { statusCode: 200 };
    } catch (error) {
        console.error("Error during sync:", error);
        return { statusCode: 500 };
    }
});
