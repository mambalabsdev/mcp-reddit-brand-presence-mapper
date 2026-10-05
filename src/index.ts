#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(here, "..", "package.json"), "utf8"),
) as { version: string; name: string };

// Distinctive UA so Apify run meta.userAgent marks MCP-originated runs.
const USER_AGENT = `mambalabs-mcp ${pkg.name}@${pkg.version}`;

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: "text"; text: string }>;
};

// Drop undefined values so optional inputs are not sent to the actor at all.
function compact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// The actor types its switches as strings ("true"/"false") for Clay
// compatibility, because Clay sends every input as a string and a boolean typed
// field silently receives "false" and reads it as truthy. The model gets a real
// boolean and the actor gets the string it validates.
function boolToString(v: boolean | undefined): string | undefined {
  return v === undefined ? undefined : v ? "true" : "false";
}

// The actor run's own timeout, in seconds, unchanged from the earlier run-sync
// call. The run ends TIMED-OUT at this limit and the caller is told so, with
// the run id, instead of a 408 while the run carries on.
const ACTOR_RUN_TIMEOUT_SECS = 300;

// How long this wrapper waits for that run, in milliseconds. The actor's own
// timeout plus two minutes, so the run's own TIMED-OUT status is what the
// caller sees rather than the wrapper giving up first and reporting nothing.
const WRAPPER_WAIT_MS = (ACTOR_RUN_TIMEOUT_SECS + 120) * 1000;
const POLL_INTERVAL_MS = 3000;

// memory=512 matches the actor's declared defaultRunOptions.memoryMbytes.
// `apify-actor-start` bills once per GB with a minimum of one, so an explicit
// value keeps the caller from paying for more memory than the actor asks for.
// Keep this in step with the actor's defaultRunOptions.
const RUN_QUERY = `timeout=${ACTOR_RUN_TIMEOUT_SECS}&memory=512`;

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED", "ABORTING"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Shared caller. actorPath is the actor's immutable Apify actor ID (a stable key
// that survives Store renames).
//
// START AND POLL, NOT RUN-SYNC. Apify's synchronous endpoints carry a platform
// ceiling of 300 seconds on the HTTP wait itself and answer 408 past it, so a
// long run reads as a timeout even though the actor goes on and bills. Starting
// the run, polling it to a terminal status and then reading the dataset waits
// as long as the actor needs.
//
// The token is read here rather than at module load, so the tool registers
// unconditionally and a server started without APIFY_TOKEN still advertises its
// capabilities.
//
// The wrapper never reinterprets a row's status field: not_extractable,
// blocked and not_found are different answers and are passed through unchanged.
async function runActor(
  actorPath: string,
  actorLabel: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return { isError: true, content: [{ type: "text", text: "APIFY_TOKEN is not set. Create a token at https://console.apify.com/account/integrations and set it as the APIFY_TOKEN environment variable." }] };
  }

  const headers = {
    Authorization: `Bearer ${APIFY_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };

  const httpError = async (response: Response): Promise<string> => {
    let detail = "";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body?.error?.message) detail = ` ${body.error.message}`;
    } catch {
      detail = "";
    }
    switch (response.status) {
      case 400:
        return `The ${actorLabel} run was rejected as invalid input.${detail}`;
      case 401:
        return "Invalid Apify token. Check your APIFY_TOKEN environment variable.";
      case 402:
        return "Insufficient Apify credits. Check your account balance at https://console.apify.com/billing";
      default:
        return `Apify request to ${actorLabel} failed with status ${response.status}.${detail}`;
    }
  };

  // 1. Start the run.
  let started: Response;
  try {
    started = await fetch(
      `https://api.apify.com/v2/acts/${actorPath}/runs?${RUN_QUERY}`,
      { method: "POST", headers, body: JSON.stringify(input) },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `Could not reach the Apify API: ${message}` }] };
  }
  if (!started.ok) {
    return { isError: true, content: [{ type: "text", text: await httpError(started) }] };
  }

  let run: { id?: string; status?: string; defaultDatasetId?: string };
  try {
    run = ((await started.json()) as { data?: typeof run }).data ?? {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run start returned a response that could not be parsed: ${message}` }] };
  }
  const runId = run.id;
  if (!runId) {
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run start returned no run id, so there is nothing to wait for.` }] };
  }

  // 2. Poll to a terminal status.
  const deadline = Date.now() + WRAPPER_WAIT_MS;
  let status = run.status ?? "READY";
  let datasetId = run.defaultDatasetId;
  while (!TERMINAL.has(status)) {
    if (Date.now() >= deadline) {
      return {
        isError: true,
        content: [{ type: "text", text: `The ${actorLabel} run ${runId} was still ${status} after ${Math.round(WRAPPER_WAIT_MS / 1000)} seconds and this call stopped waiting. The run itself is still on Apify: read it at https://console.apify.com/actors/runs/${runId}` }],
      };
    }
    await sleep(POLL_INTERVAL_MS);
    let poll: Response;
    try {
      poll = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: `Lost contact with the Apify API while waiting for ${actorLabel} run ${runId}: ${message}` }] };
    }
    if (!poll.ok) {
      return { isError: true, content: [{ type: "text", text: await httpError(poll) }] };
    }
    const body = (await poll.json()) as { data?: { status?: string; defaultDatasetId?: string } };
    status = body.data?.status ?? status;
    datasetId = body.data?.defaultDatasetId ?? datasetId;
  }

  // 3. A run that did not succeed is a failure the caller must see, never an
  // empty success.
  if (status !== "SUCCEEDED") {
    return {
      isError: true,
      content: [{ type: "text", text: `The ${actorLabel} run did not succeed (run ID: ${runId}, status: ${status}). Read it at https://console.apify.com/actors/runs/${runId}` }],
    };
  }
  if (!datasetId) {
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run ${runId} succeeded but reported no dataset, so there is nothing to return.` }] };
  }

  // 4. Read the dataset.
  let ds: Response;
  try {
    ds = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?format=json`, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `Could not read the ${actorLabel} dataset: ${message}` }] };
  }
  if (!ds.ok) {
    return { isError: true, content: [{ type: "text", text: await httpError(ds) }] };
  }

  let items: unknown;
  try {
    items = await ds.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run returned a response that could not be parsed: ${message}` }] };
  }

  if (!Array.isArray(items)) {
    const asObj = items as { error?: { type?: string; message?: string } };
    const detail = asObj?.error?.message ? `${asObj.error.message}` : JSON.stringify(items);
    return { isError: true, content: [{ type: "text", text: `The ${actorLabel} run did not return a dataset. ${detail}` }] };
  }

  return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
}

const server = new McpServer({
  name: "mamba-reddit-brand-presence-mapper",
  version: pkg.version,
});

// Reddit Brand Presence and Mention Monitor (immutable actor ID pKQZmDaT70SEb54bZ)
server.registerTool(
  "map_reddit_brand_presence",
  {
    title: "Map Reddit Brand Presence",
    description:
      "Resolve a company domain to that company's official subreddit and, optionally, sample recent public mentions of the brand. Returns the subreddit URL, subscriber count, creation date and a mention sample, as one flat Clay ready row. IMPORTANT LIMITATION: Reddit refuses a share of requests however they are routed. Measured on the platform 2026-08-23 across nine companies over residential connections, the subreddit feed was readable for four and refused for five, and the mention feed the same. A refusal is reported as blocked, never as an empty result or a zero, and is worth retrying. Subscriber counts need the caller's own Reddit app credentials (redditClientId and redditClientSecret), because Reddit refuses every unauthenticated JSON route. Use it for one company at a time; it does not monitor Reddit over time or return post text. Read only; requires an APIFY_TOKEN and consumes Apify credits per call.",
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
  },
  async ({ company_domain, company_name, handle, mentionQuery, includeMentions, includeFollowerCounts, skipCache, redditClientId, redditClientSecret }) => {
    return runActor(
      "pKQZmDaT70SEb54bZ",
      "Reddit Brand Presence and Mention Monitor",
      compact({
        company_domain,
        company_name,
        handle,
        mentionQuery,
        includeMentions: boolToString(includeMentions),
        includeFollowerCounts: boolToString(includeFollowerCounts),
        skipCache: boolToString(skipCache),
        redditClientId,
        redditClientSecret,
      }),
    );
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
