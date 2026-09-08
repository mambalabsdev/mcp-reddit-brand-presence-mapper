# Reddit Brand Presence Mapper MCP Server

[![Smithery](https://smithery.ai/badge/mambabuilt/mcp-reddit-brand-presence-mapper)](https://smithery.ai/servers/mambabuilt/mcp-reddit-brand-presence-mapper) [![Glama score](https://glama.ai/mcp/servers/mambalabsdev/mcp-reddit-brand-presence-mapper/badges/score.svg)](https://glama.ai/mcp/servers/mambalabsdev/mcp-reddit-brand-presence-mapper) [![MCP Registry](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.modelcontextprotocol.io%2Fv0%2Fservers%3Fsearch%3Dcom.mambabuilt%252Fmcp-reddit-brand-presence-mapper%26limit%3D1&query=%24.servers%5B0%5D._meta%5B%22io.modelcontextprotocol.registry%2Fofficial%22%5D.status&label=mcp%20registry&color=blue)](https://registry.modelcontextprotocol.io/v0/servers?search=com.mambabuilt/mcp-reddit-brand-presence-mapper&limit=1) [![npm version](https://img.shields.io/npm/v/@mambalabsdev/mcp-reddit-brand-presence-mapper)](https://www.npmjs.com/package/@mambalabsdev/mcp-reddit-brand-presence-mapper) [![npm downloads](https://img.shields.io/npm/dm/@mambalabsdev/mcp-reddit-brand-presence-mapper)](https://www.npmjs.com/package/@mambalabsdev/mcp-reddit-brand-presence-mapper) [![license](https://img.shields.io/github/license/mambalabsdev/mcp-reddit-brand-presence-mapper)](https://github.com/mambalabsdev/mcp-reddit-brand-presence-mapper/blob/main/LICENSE) [![mcpservers.org](https://img.shields.io/badge/mcpservers.org-listed-blue)](https://mcpservers.org/servers/mambalabsdev/mcp-reddit-brand-presence-mapper)

An MCP server that resolves a company domain to its subreddit and samples public mentions of the brand. It wraps the Mamba Labs Reddit Brand Presence and Mention Monitor actor on Apify and returns a Clay-ready flat JSON row to any MCP client.

## What's Inside

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Prerequisites](#prerequisites)
- [Example prompts](#example-prompts)
- [Inputs](#inputs)
- [Output](#output)
- [Example output](#example-output)
- [Features](#features)
- [Full actor documentation](#full-actor-documentation)
- [Mamba Labs GTM Suite](#mamba-labs-gtm-suite)
- [License](#license)

## What it does

Give it a company domain and it returns that company's subreddit, how alive that subreddit is, and a sample of how much the brand is being talked about across Reddit as a whole. One flat row per company, covering the subreddit URL, subscriber count, posting cadence and a mention sample.

Read this limitation before you build on it. Reddit's RSS routes returned HTTP 403 to Apify platform IP ranges as measured on 2026-08-22, and Reddit returns 403 on every unauthenticated JSON route. Subreddit discovery resolves, but cadence and mention fields can come back marked `blocked` rather than populated. A refusal is reported as `blocked` and never as a zero, so an absence is never mistaken for a finding. Supplying your own Reddit app client id and secret is the only route to a subscriber count.

All of the lookup runs on Apify. This package is a thin client that calls the actor and hands back the result unchanged.

## Quick start

You need Node.js 18 or newer and an Apify account with an API token.

Add this to your Claude Desktop config:

```json
{
  "mcpServers": {
    "mamba-reddit-brand-presence-mapper": {
      "command": "npx",
      "args": ["-y", "@mambalabsdev/mcp-reddit-brand-presence-mapper"],
      "env": {
        "APIFY_TOKEN": "your-apify-token"
      }
    }
  }
}
```

Get your token at https://console.apify.com/account/integrations, paste it in, and restart Claude Desktop. The `map_reddit_brand_presence` tool will be available.

## Prerequisites

- Node.js 18 or newer
- An Apify account with an API token
- Optional: your own Reddit app client id and secret, free to create at reddit.com/prefs/apps, if you want the subscriber count

## Example prompts

- "Find the subreddit for monzo.com and tell me how active it is."
- "Map the Reddit presence for stripe.com and search mentions for \"stripe.com\" rather than the brand name."
- "Look up r/monzo and skip the site wide mention sample."
- "Is there an official subreddit for figma.com?"

## Inputs

- `company_domain` (optional): bare company domain, for example `shopify.com`. Supply this or a handle. With a domain the actor runs full discovery; with a handle it skips straight to the fetch.
- `company_name` (optional): improves search accuracy and is what the identity gate checks a discovered profile against, so supplying it reduces wrong matches.
- `handle` (optional): the subreddit name with or without the `r/` prefix, for example `stripe`. Supplying it skips discovery.
- `mentionQuery` (optional): what to search Reddit for when measuring brand mentions. Defaults to your domain in quotes, which is far more precise than the brand name. A bare search for `stripe` matches the English word; `"stripe.com"` returns developer subreddits.
- `includeMentions` (optional): when true (the default) a site wide mention sample is pulled alongside the subreddit. Set false for the official subreddit only, which is one fetch instead of two.
- `includeFollowerCounts` (optional): when true (the default) the profile is fetched and the counts are extracted. Set false to resolve the profile URL only, which is cheaper and needs no proxy.
- `skipCache` (optional): when false (the default) a successful lookup is cached for seven days and reused. Set true to force a fresh fetch.
- `redditClientId` (optional): your own Reddit app client id, free to create at reddit.com/prefs/apps. This is the only route to a subscriber count, because Reddit returns 403 on every unauthenticated JSON route. Leave it empty and everything else still works.
- `redditClientSecret` (optional): your own Reddit app client secret, paired with the client id above. Used for your run only and never stored.

Supply either `company_domain` or `handle`.

## Output

The tool returns the actor's flat JSON row for the company, with 26 snake_case fields and no nested objects. `subreddit_status`, `subreddit_subscribers_status` and `mentions_status` are separate, so a blocked read is distinguishable from an empty one. See the Apify Store page for the full output schema.

## Example output

```json
{
  "degraded": false,
  "degradation_reason": null,
  "company_domain": "monzo.com",
  "company_name": "Monzo",
  "subreddit": "monzo",
  "subreddit_url": "https://www.reddit.com/r/monzo/",
  "subreddit_title": "Monzo Bank",
  "subreddit_subscribers": null,
  "subreddit_subscribers_status": "not_extractable",
  "last_post_at": "2026-08-22T14:54:12+00:00",
  "days_since_last_post": 0.6,
  "recent_post_count": 25,
  "distinct_recent_authors": 22,
  "subreddit_status": "ok",
  "mention_query_used": "\"monzo.com\"",
  "mention_sample_size": 25,
  "distinct_subreddits": 7,
  "top_subreddit": "UKfreeMoney",
  "latest_mention_at": "2026-08-23T05:24:31+00:00",
  "mentions_status": "ok",
  "run_date": "2026-08-23T06:15:29.084Z"
}
```

## Features

- Resolves an official or community subreddit starting from a company domain
- Posting cadence and recency, when Reddit serves them
- Site wide brand mention sample, when Reddit serves it
- A refused request is reported as `blocked`, never as a zero
- Your own Reddit app credentials unlock the subscriber count
- 26 flat snake_case fields, one row per company

## Full actor documentation

This server is a thin client and holds no lookup logic. For the complete input and output reference, pricing, and run history, see the Apify Store page:

https://apify.com/mambalabs/reddit-brand-presence-mapper

---

## Mamba Labs GTM Suite

This server is one of the Mamba Labs GTM Suite MCP servers. Every actor in the suite takes a domain or a company and returns one flat row, so they stack in the same Clay table without reshaping anything. The actor behind this server is the Reddit Brand Presence and Mention Monitor, immutable Apify actor ID `pKQZmDaT70SEb54bZ`.

> Built by [Mamba Labs](https://github.com/mambalabsdev) | [npm](https://www.npmjs.com/org/mambalabsdev) | [Apify Store](https://apify.com/mambalabs)

## License

MIT

Built by Mamba Labs. https://apify.com/mambalabs
