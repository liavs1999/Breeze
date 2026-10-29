# World Weather Agent — plan and decision log

**Brief (VisionHeight, Product Engineer · Client & AI):** a small web app with a chat where you can ask about the
weather anywhere in the world. The agent uses at least one external API, and some answers come with a chart.
Deliver a repository link with instructions for running the server and the client, and explain in the README when
the agent produces a chart and how to trigger one. Everything else is our call.

**Our goal:** a narrow app done very well: fast streaming answers, the right chart at the right moment, a modern
minimal UI, and a chat that survives refreshes and network failures.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Stack | TypeScript end to end: Hono server, React + Vite client, AI SDK 7 | Streaming, multi-step tool calls and tool results rendered as UI components are built in; one language and shared types |
| Chart rule | The agent decides, code enforces | Flexible answers, but the rule is written down, checked on the server and tested, so the README can state it |
| Model | Switchable by one setting (Gemini, Groq, Claude, OpenAI); develop on a free key | Free tiers are tight (5 requests/min hurt us last time); choose the demo model by measured speed |
| Delivery | Public GitHub repo + hosted demo | Reviewers can try it from a link; the README still covers running it locally |
| Data | Open-Meteo only | Global, free, no key, 600 calls/min and 10,000/day; credited in the UI (CC BY 4.0) |
| Agent shape | One agent, six tools | Several agents would add latency and gain nothing at this size |
| Design system | Mantine 9, no Tailwind | Neutral modern look by default; its charts share the theme and dark mode; plain CSS; hooks for offline state and local storage; no theme flash on refresh |
| API key | Paste your own key in the app, checked on the spot; a server key is the fallback | Reviewers can use their own key without editing files; the hosted demo works without one |

## Data (Open-Meteo)

| Need | API |
|---|---|
| Place name → coordinates, country, timezone (any language) | Geocoding |
| Current conditions, hourly and daily, 16 days ahead and 92 days back | Forecast |
| Any day since 1940; a 30-year normal for "is this unusual?" | Historical (ERA5) |
| Air quality index, PM2.5, pollen (Europe only) | Air Quality |

Each question fetches only what it needs, with a short cache (forecast ~10 min, history ~1 day).

## Agent and tools

- `get_current(place)`: conditions now; the client shows it as the "now" card (not a chart).
- `find_place(query)`: only for ambiguous names ("Springfield"); the other tools resolve names themselves to save a
  step.
- `get_forecast(place, days, hourly | daily, metrics)`: includes current conditions.
- `get_history(place, from, to, metrics, compare_to_normal?)`
- `get_air_quality(place, days)`
- `show_chart(kind, datasets, metrics)`: the chart skill.

Data tools return a short summary to the model and keep the full series on the server under a dataset id.
`show_chart` refers to dataset ids, so chart numbers never pass through the model. Tool errors go back to the model as
structured errors (for example "place not found, did you mean…"), so it explains instead of failing.

## The chart skill

**When.** Chart when the answer is a pattern over time or a comparison.

- Chart: outlooks over several days or hours, two or more places, the past compared with normal, or an explicit
  "chart / plot / graph".
- No chart: a single value or a yes/no question ("Is it raining in Oslo?"), which gets a small "now" card instead;
  three or fewer data points; follow-ups that bring no new data; "just tell me".

Enforced in three places: the agent's instructions, the `show_chart` tool description, and a server check that rejects
a chart breaking the rules (too few points, more than 4 series, mixed units) with a reason the model can act on.
About 15 test prompts (chart or not, and which kind) prove it; the same table goes in the README.

**Which chart** (picked by what the data shows):

| Data | Chart |
|---|---|
| Temperature over days | Band from each day's low to high; the normal range in gray |
| Hourly outlook | Temperature line, with a rain-chance bar panel below on the same time axis (never two y-axes) |
| Rain or snow totals | Columns |
| Several places | Up to 4 lines, fixed color per place, labeled at the line end |
| Warmer or colder than normal | Bars above and below zero, warm and cool colors |
| Air quality | Bars against the official quality bands, labeled, not color alone |

**How it looks** (following the dataviz guide): thin 2 px lines, faint grid, crosshair tooltip on hover, a
"show data" table toggle, a palette validated for colorblind safety in light and dark, the place's local time on the
axis, °C/°F switch, source and date range under every chart, fixed height so the page does not jump.

## Streaming and resilience

**Streaming.** One server-sent event stream per answer (AI SDK UI message stream): text as it is written, each tool step
with its state (running, done, failed), and the chart or "now" card as soon as its data is ready. Rendering is
throttled and finished markdown blocks are memoized, so long answers do not flicker.

**Refresh-proof.**

- The chat id is in the URL (`/c/:id`); messages are stored on the server (SQLite) and loaded on open.
- Generation runs on the server independently of the browser connection; its chunks are buffered per chat.
- After a reload the client reattaches (`useChat` `resume`): `GET /api/chats/:id/stream` replays the buffered chunks and
  continues live, so the answer finishes in place, exactly once.
- Stop is an explicit `POST /api/chats/:id/stop` that cancels the work and saves the partial answer; a refresh is not a
  stop.
- The unsent draft and the scroll position are restored; two tabs on the same chat both follow the same stream.
- Single server, so the stream buffer is in memory; with several servers it would move to Redis (the
  `resumable-stream` package).

**Resilient.**

- Client: offline banner and automatic reconnect with backoff; a retry button on a failed answer; client-generated
  message ids so a retry never duplicates a message; an error boundary per message part, so a broken chart does not
  break the chat; skeletons and fixed sizes, so nothing jumps.
- Server: timeouts and retry with backoff on Open-Meteo (honoring 429), the cache, tool errors returned to the model, a
  fallback model on LLM 429/5xx, a cap on agent steps, a per-visitor rate limit on the hosted demo, a health endpoint,
  and graceful shutdown that lets running answers finish.

**Proving it.**

- Playwright end-to-end tests: reload mid-answer → the answer completes once; go offline mid-answer → it recovers; the
  weather API failing → a clear answer instead of a crash.
- A development fault-injection switch (slow model, weather 429/500, dropped connection) to show this live in the call.

## UI: modern and minimal

Built with Mantine. One centered column, lots of whitespace, one accent color, light and dark following the system. The start screen has a
greeting and four example questions, the chart ones marked. Answers stream in; tool steps show as one quiet line
("Finding Kyoto · 7-day forecast") that folds away. Answers can carry a "now" card or a chart card. Works on a phone.

## Bring your own key

- A "Model & key" panel: pick the provider (Gemini, Groq, Claude, OpenAI), paste a key, optionally pick a model.
- **Check:** `POST /api/keys/check` makes one tiny request to the provider and reports the result in plain words: works
  (with the model and response time), invalid key, no access to that model, rate-limited or out of quota, or provider
  unreachable.
- **On load:** a saved key is checked in the background; the header shows its state (a dot with "Gemini · ready",
  "rate-limited" or "invalid key"). A key error during a chat opens the panel.
- **Where the key lives:** only in this browser (local storage if "remember on this device" is on, otherwise for this
  tab only). It is sent to our server in a request header with each chat request, used for that answer, and never
  stored, logged or put in a URL. The UI shows only its last 4 characters.
- **Order:** the browser key, then the server key from `.env` (the hosted demo's key, behind the per-visitor limit),
  otherwise the start screen asks for a key. When the demo limit is reached, the app offers to add your own key.
- Resuming a stream after a refresh needs no key: the answer is already being generated on the server.

## Libraries

| Area | Libraries |
|---|---|
| Client | React 19, Vite 8, Mantine 9 (core, hooks, charts, notifications), `@ai-sdk/react` (`useChat` with resume), React Router, `react-markdown` + `remend` (clean half-written markdown while streaming), Tabler icons |
| Charts | Recharts 3 for all chart kinds; the day rows are plain HTML (no chart library needed) |
| Server | Hono + `@hono/node-server`, AI SDK 7 + `@ai-sdk/google`, `groq`, `anthropic`, `openai`, zod 4 (schemas shared with the client), SQLite via `node:sqlite` (fallback `better-sqlite3`), `lru-cache` |
| Tests | Vitest, MSW (fake Open-Meteo responses, including failures), Playwright |
| Tooling | npm workspaces (`server`, `client`, `shared`), TypeScript, oxlint |

## Repository layout

```
server/    Hono app: chat routes, agent, tools, Open-Meteo client, chart builder, stream buffer, SQLite
client/    React app: chat, message parts (text, steps, now card, chart card), charts
shared/    zod schemas for tool inputs/outputs and chart specs, used by both sides
e2e/       Playwright tests (refresh, offline, failures)
evals/     chart-trigger prompts and runner
```

## Delivery

- Public GitHub repo. README: run the server and the client (one command each, or Docker), "When does the agent draw a
  chart?", a short architecture section.
- Hosted demo: one Docker container (resumable streams and SQLite need a long-running server, not serverless
  functions); host chosen at deploy time; demo key behind the per-visitor limit.

## Milestones

1. Scaffold: workspace, server and client running, health check.
2. Open-Meteo client and tools, with unit tests.
3. Agent loop with streaming, a basic chat UI, and the "Model & key" panel with the key check.
4. Chart skill: catalog, server check, rendering, trigger evals.
5. Persistence, resume, stop, resilience, end-to-end tests.
6. Design polish: light and dark, mobile.
7. README, Docker, hosted demo.

## Open questions

- Deadline (the PDF does not state one).
- Extras: "weather where I am" (browser location), voice input.

## Build log (29 Oct)

Decisions made while building, with the reason:

- **All six charts in Recharts directly** rather than splitting between Mantine Charts and Recharts: one set of mark
  specs (2 px lines, 24 px bars with rounded ends, crosshair tooltip, one y-axis) is easier to keep consistent.
- **Default model `gemini-3.6-flash`, fallbacks `gemini-3.5-flash` → `gemini-3.5-flash-lite`.** On the free tier the
  two Flash models allow only 20 requests per day each (measured: the quota error says so); Flash-Lite allows far
  more. A model that reports a rate limit or spent quota is skipped until the provider's retry time.
- **Chart reminder (`prepareStep`).** When fetched data qualifies for a chart and none was drawn, the next step's
  instructions restate the rule. Flash-Lite went from skipping charts to 5/5 on the chart cases; text-only requests
  stay text-only.
- **History always from the archive.** The forecast API returns empty values for dates older than a few weeks;
  the archive is complete through yesterday, and its unpublished last days are filled from the forecast API.
- **`get_forecast` takes a `date`** for the hours of a named day ("tomorrow"), not just "the next N hours".

Verified: 16 unit tests, 9 browser tests (reload mid-answer, dropped connection, weather failure, stop, offline,
draft, key check), evals 17/17 with `gemini-3.6-flash` and 5/5 chart cases with `gemini-3.5-flash-lite`.

## Design pass (29 Oct, evening)

- **One visual language for every forecast and past-data chart**: a large summary up top, condition icons along the
  top where they help, temperature colors on a fixed °C scale (blue → teal → green → yellow → orange → red), the
  scale on the right, rounded bars, one tooltip, no legend boxes (tiles or direct values instead).
- **Day rows for up to 16 days** (icon, chance of rain, low, range bar on a shared scale, high); longer periods and
  periods with normals use one temperature-colored column per day.
- **The "now" card is a sky card**: its gradient follows the condition and day or night; the next 12 hours below.
- **The page follows the sky** of the place being discussed (a soft tint at the top), frosted cards and header,
  blue user bubbles, a capsule input that glows while the agent works, shimmering "Thinking…".

## Test pass and easy wins (29 Oct, night)

Found by using the app as a visitor would:

- **Every visitor saw everyone's chats**, and any visitor could delete any chat. Now each browser keeps an
  anonymous id (a header on every request); chats are listed, stopped, continued and deleted only by the browser
  that started them. A link still opens for anyone, read-only, with "Continue as my chat" to make a copy.
- **"Springfield, Ohio, United States" resolved to Missouri**: the place hints were matched as one phrase, so the
  shared country matched every Springfield. Each hint must now fit, and two-letter hints are country codes ("US" is
  not part of "Russia").
- **Model fallback within one answer**: the list of models to skip was read once per answer, so each later step
  tried the spent models again. It is now read before every call.
- **Whole degrees in the text**, as on the charts (the model was writing 26.5° next to a chart showing 27°).

Added: follow-up questions under the latest answer and the found places as buttons when a name is ambiguous (both
read from the answer, no extra model call), dictation with the browser's speech recognition, and the chat's first
question as the tab title. Tried and removed: a "weather where I am" button; the "Simulate failures" panel (the
browser tests still inject failures; the injection is off in production).

Seen but left: a written answer stays in the units it was written in when °C/°F is switched (charts convert);
Hebrew text is laid out left to right; the agent does not answer sunrise and sunset (the data is fetched for the
now card's request but not passed on); beyond 16 days the agent says no forecast exists instead of describing a
typical year.

## Delivery (30 Oct)

Renamed to Breeze. Delivered as a public repo that runs locally (npm or Docker); no hosted demo. The agent now gets
the user's local date and time, so "tomorrow" follows their calendar rather than UTC.
