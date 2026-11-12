# Reddit Brand Presence Mapper MCP Server

[![Glama score](https://glama.ai/mcp/servers/mambalabsdev/mcp-reddit-brand-presence-mapper/badges/score.svg)](https://glama.ai/mcp/servers/mambalabsdev/mcp-reddit-brand-presence-mapper) [![MCP Registry](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fregistry.modelcontextprotocol.io%2Fv0%2Fservers%3Fsearch%3Dcom.mambabuilt%252Fmcp-reddit-brand-presence-mapper%26limit%3D1&query=%24.servers%5B0%5D._meta%5B%22io.modelcontextprotocol.registry%2Fofficial%22%5D.status&label=mcp%20registry&color=blue)](https://registry.modelcontextprotocol.io/v0/servers?search=com.mambabuilt/mcp-reddit-brand-presence-mapper&limit=1) [![npm version](https://img.shields.io/npm/v/@mambalabsdev/mcp-reddit-brand-presence-mapper)](https://www.npmjs.com/package/@mambalabsdev/mcp-reddit-brand-presence-mapper) [![npm downloads](https://img.shields.io/npm/dm/@mambalabsdev/mcp-reddit-brand-presence-mapper)](https://www.npmjs.com/package/@mambalabsdev/mcp-reddit-brand-presence-mapper) [![license](https://img.shields.io/github/license/mambalabsdev/mcp-reddit-brand-presence-mapper)](https://github.com/mambalabsdev/mcp-reddit-brand-presence-mapper/blob/main/LICENSE) [![mcpservers.org](https://img.shields.io/badge/mcpservers.org-listed-blue)](https://mcpservers.org/servers/mambalabsdev/mcp-reddit-brand-presence-mapper)

<a href="https://mcprush.com/to/reddit-brand-presence-mapper-mcp?ref=badge"><img width="380" height="200" src="https://mcprush.com/badge/reddit-brand-presence-mapper-mcp/card.svg" alt="Reddit Brand Presence Mapper MCP server" /></a>

> 📌 **Status, 12 November 2026**
>
> **Working:** the subreddit profile and its 25 newest posts, read from Arctic Shift, a free public archive of Reddit (no key, about 15 minutes behind live Reddit). Site wide brand mentions, through your own Serper or Brave search key. Live subscriber counts, for callers who already hold an approved Reddit app.
>
> **Changed:** Reddit closed logged out search on about 5 November 2026 and ends its RSS feeds on 13 November 2026. Actor versions up to 0.2.15 read only those feeds. Server 1.3.0 targets actor version 0.3, which reads no RSS. What to use instead: leave `reddit_route` on `arctic_shift` for the subreddit, and pass `search_api_key` for mentions across all of Reddit. A blocked run charges only the start fee.

An MCP server that resolves a company domain to its subreddit and samples public mentions of the brand. It wraps the Mamba Labs Reddit Brand Presence and Mention Monitor actor on Apify and returns a Clay-ready flat JSON row to any MCP client.

## What's Inside

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Prerequisites](#prerequisites)
- [Example prompts](#example-prompts)
- [Inputs](#inputs)
- [Output](#output)
- [Example output](#example-output)
- [Routes and fallback](#routes-and-fallback)
- [Features](#features)
- [Pricing](#pricing)
- [Full actor documentation](#full-actor-documentation)
- [Mamba Labs GTM Suite](#mamba-labs-gtm-suite)
- [Version notes](#version-notes)
- [License](#license)

## What it does

Give it a company domain and it returns that company's subreddit, how alive that subreddit is, and, with your own search key, a sample of how much the brand is talked about across Reddit as a whole. One flat row per company.

Read these limits before you build on it. Arctic Shift searches only inside a named subreddit, so mentions across all of Reddit need your own Serper or Brave key; without one, `mentions_status` reads `needs_search_key` and no mention event is charged. Arctic Shift is an outside archive run by an independent open source project, and it rate limits fast repeat calls: on 2026-11-12, 1 company in each of two runs of 10 read `blocked` after 5 retries. A `blocked` row charges nothing and is worth retrying.

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
- Optional: your own Serper (serper.dev) or Brave Search API key, for brand mentions across all of Reddit
- Optional: your own Reddit app client id and secret, for a live subscriber count. Only apps Reddit approved before 2026-10-31 work: Reddit stopped approving new apps that day and closes its API by March 2027

## Example prompts

- "Find the subreddit for monzo.com and tell me how active it is."
- "Map the Reddit presence for stripe.com and search mentions for \"stripe.com\" rather than the brand name."
- "Look up r/monzo and skip the site wide mention sample."
- "Map the Reddit presence for notion.com with my Serper key and tell me which subreddit talks about it most."
- "Is there an official subreddit for figma.com?"

## Inputs

- `company_domain` (optional): bare company domain, for example `shopify.com`. Supply this or a handle. With a domain the actor runs full discovery; with a handle it skips straight to the fetch.
- `company_domains` (optional): a list of bare company domains. Each becomes its own row, so a list of 500 is one run and one start charge.
- `company_name` (optional): improves search accuracy and is what the identity gate checks a discovered profile against, so supplying it reduces wrong matches.
- `handle` (optional): the subreddit name with or without the `r/` prefix, for example `stripe`. Skips discovery. Read from Arctic Shift, no key needed.
- `mentionQuery` (optional): what to search for site wide brand mentions. Needs `search_api_key`, because Arctic Shift searches only inside a named subreddit. Defaults to your domain in quotes, which is more precise than the brand name.
- `includeMentions` (optional): true (the default) pulls a mention sample when a search key is given; without one the row says `needs_search_key` and charges nothing for mentions. False for the subreddit only.
- `includeFollowerCounts` (optional): kept so saved calls still validate. No effect in actor version 0.3.
- `skipCache` (optional): kept so saved calls still validate. No effect in actor version 0.3.
- `reddit_route` (optional): main route. `arctic_shift` (default, free archive, no key), `search_key` (your Serper or Brave key searches `site:reddit.com` for the subreddit and the mentions), or `both`. The run falls back to the other route on its own when the main one fails and the other can run. With no key, every choice runs as `arctic_shift`.
- `search_provider` (optional): `serper` or `brave`, the provider of your key. Defaults to `serper` when a key is given. Exa is not offered: it returned 0 reddit.com results in testing on 2026-11-12.
- `search_api_key` (optional): your own Serper or Brave key. Used for that run only, never stored, never written to a row. Your provider bills you for up to 2 searches per company.
- `redditClientId` (optional): your own Reddit app client id, for a live subscriber count and as a fallback when Arctic Shift fails. Only for apps Reddit approved before 2026-10-31; this route ends when Reddit closes its API by March 2027.
- `redditClientSecret` (optional): your own Reddit app client secret, paired with the client id. Used for that run only and never stored.
- `max_charge_usd` (optional): spending cap for this call, in USD. The actor stops before any charge that would take the run past this amount and keeps every row already charged.

Supply either `company_domain` or `handle`.

## Output

The tool returns the actor's flat JSON row for the company, with 33 snake_case fields and no nested objects. `subreddit_status`, `subreddit_subscribers_status` and `mentions_status` are separate, so a blocked read is distinguishable from an empty one. `data_route` names every route that supplied data on the row (`arctic_shift`, `search_serper`, `search_brave`, `reddit_app`), and `route_note` says in plain words which route could not run and what the run used instead. See the Apify Store page for the full output schema.

## Example output

```json
{
  "degraded": false,
  "company_domain": "notion.com",
  "company_name": "Notion",
  "subreddit": "Notion",
  "subreddit_url": "https://www.reddit.com/r/Notion/",
  "subreddit_subscribers": 476168,
  "subreddit_subscribers_status": "archive",
  "subreddit_subscribers_as_of": "2026-11-12T15:02:35.000Z",
  "last_post_at": "2026-11-12T15:02:21.000Z",
  "recent_post_count": 25,
  "posts_per_week": 164.9,
  "subreddit_status": "ok",
  "mention_query_used": "\"notion.com\"",
  "mentions_status": "needs_search_key",
  "embed_checked": false,
  "data_route": "arctic_shift",
  "route_note": "Mentions not searched: a search across all of Reddit needs your own Serper or Brave search key. Arctic Shift searches only inside a named subreddit.",
  "row_status": "ok",
  "billable_events_json": "[{\"event\":\"company-checked\",\"count\":1},{\"event\":\"profile-resolved\",\"count\":1}]"
}
```

Abridged from beta build 0.3.5 run `zYhwO0aAm5LutxggV` on 2026-11-12, no search key given.

## Routes and fallback

| Route | Source | Key | What it gives |
| --- | --- | --- | --- |
| `arctic_shift` (default) | Arctic Shift public archive of Reddit | none | Subreddit by name, title, description, 25 newest posts, a subscriber count recorded with the newest post |
| `search_key` | Your Serper or Brave key, searching `site:reddit.com` | yours | Subreddit discovery and site wide brand mentions |
| `both` | Both, merged | yours | Everything above |
| Reddit app (`redditClientId`, `redditClientSecret`) | Reddit's own API through your app | yours | Live subscriber count, and the subreddit profile when Arctic Shift fails |

- When the main route fails or cannot run and the other route can, the run switches on its own and writes what happened in `route_note`.
- A key your provider refuses (HTTP 401, 402, 403, or 429, and 422 on Brave) is tried once per run; the run keeps going on Arctic Shift.
- Search key rows carry no comments. The search returns at most 20 results per company, so mention numbers are a sample.

## Features

- Resolves an official or community subreddit starting from a company domain
- Posting cadence and recency from the 25 newest posts
- Site wide brand mention sample, with your own search key
- You pick the main route, and the run falls back to the other one on its own
- `data_route` on every row names the source of each number
- A company where every source failed is reported as `blocked` and charges nothing
- 33 flat snake_case fields, one row per company

## Pricing

You pay per event on Apify, billed to your own Apify account. Prices from the live pricing record, read 2026-10-16:

| Event | Price per event (USD) | Fires when |
| --- | --- | --- |
| `apify-actor-start` | $0.00005 | Charged when the Actor starts running. Number of events charged depends on Actor memory (one event per GB, minimum one event). |
| `company-checked` | $0.0095 on the Free plan, down to $0.00665 on higher Apify plans | Once per company where at least one source answered and a non degraded row was produced, whether or not a subreddit was found. Does not fire on a degraded row or on a company where every source failed. |
| `profile-resolved` | $0.0065 on the Free plan, down to $0.00455 on higher Apify plans | Once per company whose subreddit passed the identity gate and returned its newest posts. |
| `mention-sample-collected` | $0.008 on the Free plan, down to $0.0056 on higher Apify plans | Once per company for which the search returned at least one Reddit post. Does not fire without a search key, on a refused key, or when mentions are turned off. |

A blocked run charges only the start fee. From actor version 0.3, a company where every source failed charges no `company-checked` and no `profile-resolved`; up to 0.2.15 such a company still charged `company-checked`. Your search key and Reddit app are billed by their own providers.

The [actor's Apify page](https://apify.com/mambalabs/reddit-brand-presence-mapper) carries the current prices. Running this server consumes Apify credits.

## Full actor documentation

This server is a thin client and holds no lookup logic. For the complete input and output reference, pricing, and run history, see the Apify Store page:

https://apify.com/mambalabs/reddit-brand-presence-mapper

---

## Mamba Labs GTM Suite

This server is one of the Mamba Labs GTM Suite MCP servers. Every actor in the suite takes a domain or a company and returns one flat row, so they stack in the same Clay table without reshaping anything. The actor behind this server is the Reddit Brand Presence and Mention Monitor, immutable Apify actor ID `pKQZmDaT70SEb54bZ`.

> Built by [Mamba Labs](https://github.com/mambalabsdev) | [npm](https://www.npmjs.com/org/mambalabsdev) | [Apify Store](https://apify.com/mambalabs)

## Version notes

**1.3.0, 2026-11-12** (actor version 0.3)
- Sources: no RSS. Arctic Shift public archive for the subreddit, your own Serper or Brave key for site wide mentions, Reddit's public embed page to date a mention Arctic Shift lacks, your own Reddit app as an optional route.
- Fields: new tool inputs `reddit_route`, `search_provider`, `search_api_key`; new output fields `subreddit_subscribers_as_of`, `embed_checked`, `data_route`, `route_note`. Every earlier input is kept.
- Charges: prices unchanged. A company where every source failed charges nothing beyond the start fee.

**1.2.1**
- README refresh. Targets actor version 0.2, which read Reddit's RSS feeds.

## License

MIT

Built by Mamba Labs. https://apify.com/mambalabs
