import { getStore } from '@netlify/blobs';
import { TodoistApi } from '@doist/todoist-api-typescript';
import type { Config } from "@netlify/functions";
import ical from 'node-ical';

export default async (req: Request) => {
    const store = getStore("sync-state");
    
    try {
        console.log("Sync started...");
        const todoistToken = process.env.TODOIST_API_TOKEN;
        const icalUrl = process.env.EDUVIDUAL_ICAL_URL;
        const projectId = process.env.TODOIST_PROJECT_ID;
        
        if (!todoistToken || !icalUrl) {
            console.error("Missing environment variables.");
            await store.setJSON("latest", { timestamp: new Date().toISOString(), status: "error (missing env vars)" });
            return new Response("Missing env vars", { status: 500 });
        }
        
        const todoist = new TodoistApi(todoistToken);
        
        console.log("Fetching iCal feed...");
        let events;
        try {
            events = await ical.async.fromURL(icalUrl);
        } catch (icalError: any) {
            console.error("Failed to fetch or parse iCal URL:", icalError);
            await store.setJSON("latest", { timestamp: new Date().toISOString(), status: `error: Failed to fetch iCal feed - ${icalError.message || icalError}` });
            return new Response("iCal error", { status: 500 });
        }
        
        const eventList = Object.values(events).filter(e => e && e.type === 'VEVENT');
        console.log(`Found ${eventList.length} events in feed.`);
        
        let processedIds: string[] = [];
        try {
            const storedIds = await store.get("processed-events", { type: "json" });
            if (Array.isArray(storedIds)) {
                processedIds = storedIds;
            }
        } catch (e) {
            console.log("No processed events found, starting fresh.");
        }
        const processedSet = new Set(processedIds);
        
        const now = new Date();

        for (const item of eventList) {
            const eventItem = item as any;
            const summary = eventItem.summary;
            const end = eventItem.end;
            const uid = eventItem.uid;
            
            const eventUrl = eventItem.url;
            const eventDescription = eventItem.description;
            
            if (!summary || !end || !uid) continue;

            const originalDate = new Date(end);
            
            if (originalDate < now) {
                console.log(`Skipping past event: ${summary}`);
                continue;
            }
            
            if (processedSet.has(uid)) {
                console.log(`Skipping already processed task: ${summary}`);
                continue;
            }
            
            const shiftedDate = new Date(originalDate.getTime() - (24 * 60 * 60 * 1000));
            
            // Build rich description
            let taskDescription = "";
            if (eventDescription) taskDescription += `${eventDescription}\n\n`;
            if (eventUrl) taskDescription += `🔗 Link: ${eventUrl}`;
            
            const taskArgs: any = {
                content: summary,
                description: taskDescription.trim(),
                ...(projectId && { projectId })
            };

            if (eventItem.datetype === 'date') {
                taskArgs.dueDate = shiftedDate.toISOString().split('T')[0];
            } else {
                taskArgs.dueDatetime = shiftedDate.toISOString();
            }
            
            console.log(`Creating task: "${summary}" | Due: ${taskArgs.dueDate || taskArgs.dueDatetime}`);
            try {
                await todoist.addTask(taskArgs);
                processedSet.add(uid);
            } catch (taskError: any) {
                console.error(`Failed to create task ${summary}:`, taskError);
            }
        }
        
        await store.setJSON("processed-events", Array.from(processedSet));
        
        console.log("Sync completed successfully.");
        await store.setJSON("latest", { timestamp: new Date().toISOString(), status: "success" });
        return new Response("OK", { status: 200 });
    } catch (error: any) {
        console.error("Critical Error during sync:", error);
        await store.setJSON("latest", { timestamp: new Date().toISOString(), status: `error: Critical Sync Failure - ${error.message || String(error)}` });
        return new Response("Error", { status: 500 });
    }
};

export const config: Config = {
    schedule: "0 * * * *"
};
