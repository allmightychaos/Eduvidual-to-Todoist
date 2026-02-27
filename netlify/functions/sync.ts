import { schedule } from '@netlify/functions';
import { TodoistApi } from '@doist/todoist-api-typescript';
import ical from 'node-ical';

export const handler = schedule("0 * * * *", async (event) => {
    try {
        console.log("Sync started...");
        const todoistToken = process.env.TODOIST_API_TOKEN;
        const icalUrl = process.env.EDUVIDUAL_ICAL_URL;
        
        if (!todoistToken || !icalUrl) {
            console.error("Missing environment variables.");
            return { statusCode: 500 };
        }
        
        const todoist = new TodoistApi(todoistToken);
        
        const events = await ical.async.fromURL(icalUrl);
        const eventList = Object.values(events).filter(e => e.type === 'VEVENT');
        
        console.log(`Fetching active Todoist tasks...`);
        const activeTasks = await todoist.getTasks();
        const activeTaskNames = new Set(activeTasks.map(t => t.content));
        console.log(`Found ${activeTasks.length} active tasks.`);
        
        return { statusCode: 200 };
    } catch (error) {
        console.error("Error during sync:", error);
        return { statusCode: 500 };
    }
});
