#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
// Distinctive UA so Apify run meta.userAgent marks MCP-originated runs.
const USER_AGENT = `mambalabs-mcp ${pkg.name}@${pkg.version}`;
const APIFY_TOKEN = process.env.APIFY_TOKEN;
// Drop undefined values so optional inputs are not sent to the actor at all.
function compact(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined)
            out[k] = v;
    }
    return out;
}
// The actor types its switches as strings ("true"/"false") for Clay
// compatibility, because Clay sends every input as a string and a boolean typed
// field silently receives "false" and reads it as truthy. The model gets a real
// boolean and the actor gets the string it validates.
function boolToString(v) {
    return v === undefined ? undefined : v ? "true" : "false";
}
// actorPath is the actor's IMMUTABLE Apify actor id, not its slug, so a Store
// rename never breaks these calls.
async function runActor(actorPath, actorLabel, input) {
    if (!APIFY_TOKEN) {
        return { isError: true, content: [{ type: "text", text: "APIFY_TOKEN is not set. Create a token at https://console.apify.com/account/integrations and set it as the APIFY_TOKEN environment variable." }] };
    }
    // memory=512 is deliberate and matches the actor's declared
    // defaultRunOptions.memoryMbytes. run-sync-get-dataset-items runs at 2048 MB
    // unless told otherwise, and `apify-actor-start` bills once per GB with a
    // minimum of one, so leaving the default in place would charge the caller
    // more start events per run than the actor asks for. Keep this in step with
    // the actor's defaultRunOptions.
    const url = `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items?timeout=300&memory=512`;
    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${APIFY_TOKEN}`,
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
            body: JSON.stringify(input),
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: `Could not reach the Apify API: ${message}` }] };
    }
    if (!response.ok) {
        let detail = "";
        try {
            const body = (await response.json());
            if (body?.error?.message)
                detail = ` ${body.error.message}`;
        }
        catch {
            detail = "";
        }
        let message;
        switch (response.status) {
            case 401:
                message = "Invalid Apify token. Check your APIFY_TOKEN environment variable.";
                break;
            case 402:
                message = "Insufficient Apify credits. Check your account balance at https://console.apify.com/billing";
                break;
            case 408:
                message = `The ${actorLabel} run timed out after 300 seconds. Try again, or run the actor on Apify directly for longer jobs.`;
                break;
            default:
                message = `Apify request to ${actorLabel} failed with status ${response.status}.${detail}`;
        }
        return { isError: true, content: [{ type: "text", text: message }] };
    }
    // A 2xx normally carries the dataset array. Pass actor output through
    // unchanged: the wrapper must never reinterpret a status field, because
    // not_extractable, blocked and not_found are different answers and collapsing
    // them is exactly the defect the actor was built to avoid.
    const items = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
}
const server = new McpServer({
    name: "mamba-reddit-brand-presence-mapper",
    version: pkg.version,
});
// Reddit Brand Presence and Mention Monitor (immutable actor ID pKQZmDaT70SEb54bZ)
server.registerTool("map_reddit_brand_presence", {
    title: "Map Reddit Brand Presence",
    description: "Resolve a company domain to that company's official subreddit and, optionally, sample recent public mentions of the brand. Returns the subreddit URL, subscriber count, creation date and a mention sample, as one flat Clay ready row. IMPORTANT LIMITATION: Reddit's RSS routes return HTTP 403 to Apify platform IP ranges as measured on 2026-08-22, so subreddit discovery resolves but cadence and mention fields come back marked blocked rather than populated. The row reports blocked rather than an empty result, so an absence is never mistaken for a finding. Read only; requires an APIFY_TOKEN and consumes Apify credits per call.",
    annotations: {
        title: "Map Reddit Brand Presence",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
    },
    inputSchema: {
        company_domain: z.string()
            .optional()
            .describe("Bare company domain, for example shopify.com. Supply this or a handle. With a domain the actor runs full discovery; with a handle it skips straight to the fetch."),
        company_name: z.string()
            .optional()
            .describe("Optional. Improves search accuracy and is what the identity gate checks a discovered profile against, so supplying it reduces wrong matches."),
        handle: z.string()
            .optional()
            .describe("Optional. The subreddit name with or without the r/ prefix, for example stripe. Supplying it skips discovery."),
        mentionQuery: z.string()
            .optional()
            .describe("What to search Reddit for when measuring brand mentions. Defaults to your domain in quotes, which is measured far more precise than the brand name: a bare search for \"stripe\" returns r/Horses and r/MyHeroAcadamia because Reddit matches the English word, while \"stripe.com\" returns developer subreddits."),
        includeMentions: z.boolean()
            .optional()
            .describe("When \"true\" (default) a site wide mention sample is pulled alongside the subreddit. Set \"false\" for the official subreddit only, which is one fetch instead of two. Sent as a string for Clay compatibility."),
        includeFollowerCounts: z.boolean()
            .optional()
            .describe("When \"true\" (default) the profile page is fetched and the counts are extracted. Set \"false\" to resolve the profile URL only, which is cheaper and needs no proxy. Sent as a string for Clay compatibility."),
        skipCache: z.boolean()
            .optional()
            .describe("When \"false\" (default) a successful lookup is cached for seven days and reused. Set \"true\" to force a fresh fetch. Sent as a string for Clay compatibility."),
        redditClientId: z.string()
            .optional()
            .describe("YOUR OWN Reddit app client id. Free to create at reddit.com/prefs/apps. This is the only route to a subscriber count: Reddit returns 403 on every unauthenticated JSON route. Leave empty and everything else still works."),
        redditClientSecret: z.string()
            .optional()
            .describe("YOUR OWN Reddit app client secret, paired with the client id above. Used for your run only and never stored."),
    },
}, async ({ company_domain, company_name, handle, mentionQuery, includeMentions, includeFollowerCounts, skipCache, redditClientId, redditClientSecret }) => {
    return runActor("pKQZmDaT70SEb54bZ", "Reddit Brand Presence and Mention Monitor", compact({
        company_domain,
        company_name,
        handle,
        mentionQuery,
        includeMentions: boolToString(includeMentions),
        includeFollowerCounts: boolToString(includeFollowerCounts),
        skipCache: boolToString(skipCache),
        redditClientId,
        redditClientSecret,
    }));
});
const transport = new StdioServerTransport();
await server.connect(transport);
