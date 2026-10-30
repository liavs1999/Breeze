# Breeze: design notes

**The brief:** a small web app with a chat about the weather anywhere in the world; the agent uses at least one
external API, and some answers come with a chart. **The goal:** a narrow app done very well — fast streaming answers,
the right chart at the right moment, a clean interface, and a chat that survives refreshes and network failures.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Stack | TypeScript end to end: Hono on Node 22, React + Vite, AI SDK 7 | Streaming, multi-step tool calls and typed tool results in the UI are built in; one language, shared types |
| Agent | One agent, six tools | Several agents would add latency and gain nothing at this size |
| Charts | The agent decides, the code enforces | Flexible answers, but the rule is written down, enforced on the server and tested |
| Data | Open-Meteo only | Global, free, no key; forecast, history since 1940, normals and air quality from one source |
| Models | Gemini, Groq, Anthropic or OpenAI; the key in `server/.env` or pasted in the app | Develop on a free key; reviewers use their own without editing files |
| Storage | SQLite (`node:sqlite`) for chats and a weather cache; one server | Nothing to install; survives restarts |
| Interface | Mantine 9 and Recharts 3 | A clean, consistent look with dark mode; full control over every chart |
| Delivery | Runs locally with npm or Docker | Answers stream and resume from a long-running server, which rules out free serverless hosting |

## Agent and tools

| Tool | Purpose |
|---|---|
| `find_place` | only for ambiguous names ("Springfield"), so the agent can ask which one |
| `get_current` | conditions now and today's range, shown as the "now" card |
| `get_forecast` | daily up to 16 days, hourly up to 7 days, or the hours of one named day |
| `get_history` | any day since 1940, optionally with the 1991–2020 normal for each day |
| `get_air_quality` | European AQI and PM2.5 for up to 5 days |
| `show_chart` | one of six chart kinds, built on the server from data already fetched |

- Data tools resolve place names themselves (one step instead of two) and return a short summary in the user's
  units; the full series stays on the server under a dataset id. Charts refer to dataset ids, so chart numbers never
  pass through the model.
- Inputs are strict zod schemas shared with the client. Errors return to the model as instructions it can act on
  ("only 3 data points: answer in text"), so it explains instead of failing.
- The instructions carry the user's local date and time, so "tomorrow" follows their calendar.

## The chart rule

**When:** the answer is a pattern over time or a comparison — 3+ days, the next hours, 2–4 places, the past
compared with normal, or an explicit request. **Not** for a single value or "right now" (a "now" card instead),
three or fewer points, follow-ups without new data, or "text only".

**Enforced in three places:**

1. The instructions and the `show_chart` description state the rule and which kind fits which data.
2. When an answer fetched qualifying data (4+ days, 6+ hours, 2+ days of air quality) and drew no chart, the next step
   must call `show_chart` (`prepareStep` with a forced tool choice). The agent still picks the kind; "text only" is
   never forced, and after one attempt the agent is free again, so a rejected chart cannot loop.
3. The server rejects a chart that breaks the rules (too few points, wrong kind for the data, one place in a
   comparison) with a reason the model can act on.

Evals (`npm run evals`) check the decisions against the real model: chart or not, which kind, which tools, and that
every number in the answer appears in the fetched data.

## Streaming and resilience

- **Resumable answers.** The answer runs on the server, independent of the browser connection; its stream is buffered
  per chat. After a reload the client reattaches (`GET /api/chat/:id/stream`): a full replay, then live, so the
  answer finishes in place exactly once. Stop is explicit (`POST /api/chats/:id/stop`) and keeps the partial answer.
- **Client:** offline banner and automatic reconnect with backoff, retry on a failed answer, message ids that make a
  retry idempotent, an error boundary per message part, draft and scroll position restored, no theme flash.
- **Server:** Open-Meteo calls with timeouts, retries (honoring 429) and a stale-if-error cache; a step cap; backup
  models when a Gemini model is rate-limited, skipping a spent model until its reset time; graceful shutdown.
- **Proved by** browser tests that reload mid-answer, drop the connection, go offline and break the weather API
  (failures are injected only outside production).

## Keys and privacy

- A key is either in `server/.env` (it never reaches the browser) or pasted in the app (kept in the browser, sent as a
  header with each question, never stored or logged on the server). Only the last four characters are ever shown.
- The key panel checks every model of the provider with one tiny request each, shows which ones work, and keeps the
  last check so it can be shown again without spending quota.
- Each browser has an anonymous id: it lists, continues and deletes only its own chats. A chat link opens read-only for
  anyone else, with "Continue as my chat" to make a copy. There are no accounts.

## Libraries

| Area | Libraries |
|---|---|
| Client | React 19, Vite, Mantine 9, `@ai-sdk/react` (`useChat` with resume), React Router, `react-markdown` + `remend` (clean half-written markdown while streaming), Recharts 3, Tabler icons |
| Server | Hono, AI SDK 7 with the Google, Groq, Anthropic and OpenAI providers, zod 4, `node:sqlite`, `lru-cache` |
| Tests | Vitest, Playwright (with a scripted model, so browser tests need no key) |
| Tooling | npm workspaces (`shared`, `server`, `client`), TypeScript, oxlint, esbuild, Docker |

## Layout

```
shared/   schemas and types used by both sides: chart catalog, units, weather codes, API
server/   routes, agent (instructions, tools, chart rules, models), Open-Meteo client, streams, SQLite;
          unit tests in server/test, evals in server/src/evals
client/   chat, message parts, now card, charts, suggestions, key panel
e2e/      Playwright browser tests
```

## Known limits

- One server instance: answers in progress are buffered in memory (several instances would need Redis).
- Free Gemini keys allow about 20 requests a day on the Flash models; Breeze then falls back to Flash-Lite.
- Switching °C/°F converts the charts at once; an answer already written stays in its units.
- Not yet: right-to-left layout for Hebrew and Arabic, sunrise and sunset, typical weather beyond the 16-day forecast.
