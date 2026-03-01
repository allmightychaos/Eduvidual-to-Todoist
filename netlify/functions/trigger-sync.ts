// Triggers the GitHub Actions sync workflow via workflow_dispatch.
// Called by the Force Sync button on the status dashboard.
// Requires GITHUB_PAT (Netlify env var) with "workflow" scope.

export default async (req: Request): Promise<Response> => {
    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    const pat    = Netlify.env.get("GITHUB_PAT");
    const owner  = "allmightychaos";
    const repo   = "Eduvidual-to-Todoist";
    const workflow = "sync.yml";

    if (!pat) {
        return new Response(
            JSON.stringify({ error: "GITHUB_PAT not configured" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }

    const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
        {
            method: "POST",
            signal: AbortSignal.timeout(10000),
            headers: {
                Authorization: `Bearer ${pat}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ ref: "main" }),
        },
    );

    // GitHub returns 204 No Content on success
    if (res.status === 204) {
        return new Response(
            JSON.stringify({ ok: true, message: "Sync triggered - check back in ~1 minute." }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    }

    const body = await res.text().catch(() => "");
    return new Response(
        JSON.stringify({ error: `GitHub API returned ${res.status}`, detail: body }),
        { status: 502, headers: { "Content-Type": "application/json" } },
    );
};
