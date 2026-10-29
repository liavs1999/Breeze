# Atmos: a weather chat agent

Ask about the weather anywhere in the world: forecasts, past weather, "is this normal?", air quality. An agent
fetches real data through tools, answers stream in as they are written, and questions about a period or a
comparison come with a chart.

## Run it

Needs Node 22.12+ (or Docker) and an LLM key: a free [Google Gemini key](https://aistudio.google.com/apikey), or a
Groq, Anthropic or OpenAI key. You can put it in `server/.env`, or paste it in the app (**Model & key**, top right),
where it is checked on the spot.

```bash
npm install
cp server/.env.example server/.env     # optional: add your key here
npm run dev                            # server + client → http://localhost:5180
```

Or run them separately: `npm run dev -w server` (API on :8787) and `npm run dev -w client` (web app on :5180).
Production, one port: `npm run build && npm start`, or `docker compose up --build` → http://localhost:8787.

## When does the agent draw a chart?

**When the answer is a pattern over time or a comparison.** The agent decides by calling the `show_chart` tool;
the server checks the request against the rules and builds the chart from the fetched data, so the model never
writes a number on a chart.

| Ask… | You get |
|---|---|
| about 3 or more days: *"What will the weather be like in Tokyo this week?"* | day rows: icon, chance of rain, low, a temperature-colored range bar, high |
| about the next hours or a day: *"Will it rain in London in the next 24 hours?"*, *"Tomorrow hour by hour in Tel Aviv"* | hour by hour: high and low, condition icons, a line colored by temperature with H and L, chance of rain |
| about rain or snow amounts: *"How much rain fell in Mumbai in the last two weeks?"* | the total, condition icons, columns that deepen with heavier rain |
| to compare 2–4 places: *"Compare Paris, Rome and Madrid over the next 5 days"* | a tile per place with its headline value, one line per place |
| whether it was unusual: *"Was last month warmer than normal in New York?"* | the average difference from the 1991–2020 normal, warm and cool bars |
| about air quality: *"How's the air quality in Delhi over the next few days?"* | the peak and its level, the color scale, bars colored by level |
| about a longer past period: *"Daily temperatures in Berlin during August"* | one temperature-colored column per day, low to high |

Every chart has a **Data** toggle with the same values as a table.

**No chart** for a single value or "right now" (*"What's the temperature in Reykjavík right now?"* shows a compact
"now" card instead), for three or fewer data points, for follow-ups that bring no new data (*"…in Fahrenheit?"*),
or when you ask for text only.

Where it lives: the rules for the model are in [`server/src/agent/instructions.ts`](server/src/agent/instructions.ts),
the enforcement in [`server/src/agent/charts.ts`](server/src/agent/charts.ts), the rendering in
[`client/src/charts/`](client/src/charts), and the proof in [`server/src/evals/cases.ts`](server/src/evals/cases.ts).

## How it works

```
client (React, Mantine) ──POST /api/chat──▶ server (Hono)
   useChat: streams text,                      agent: AI SDK tool loop (max 8 steps)
   tool steps, cards, charts ◀──SSE stream───    tools → Open-Meteo (geocoding, forecast, history, air quality)
                                                 show_chart → chart rules → chart built from stored data
                                                 SQLite: chats + API cache · stream buffer: resumable answers
```

**Agent and tools.** One agent with six tools shaped around user tasks, not API endpoints: every data tool
resolves the place name itself (one step instead of two), returns a compact summary in the user's units (the full
series stays on the server under a dataset id), and reports errors as instructions the model can act on ("Only 3
data points: answer in text instead"). Inputs are strict schemas (zod, shared with the client). Charts reference
dataset ids, so their numbers come from the API, never from the model. When fetched data qualifies for a chart and none
was drawn, the next step's instructions restate the rule (`prepareStep`), which keeps smaller models consistent.
Guardrails: a step cap, timeouts, an explicit stop, a per-visitor limit on the server key, and fallback models when
the provider is rate-limited (a model that reports a spent quota is skipped until its reset). Every step is logged
(tools, tokens, model) and each answer shows which model answered and how long it took.

**Look and feel.** System font, frosted cards, and a sky that follows the weather: the top of the page and the
"now" card take the gradient of the current conditions and time of day at the place being discussed. Temperature
colors are on a fixed scale, so a color always means the same temperature. The input glows while the agent works.

**Streaming and resilience.**

- **Refresh mid-answer:** the answer keeps running on the server; the page reloads the saved chat and reattaches
  to the stream (full replay, then live), so it finishes in place, exactly once.
- **Dropped connection or offline:** an offline banner, then an automatic reconnect with backoff.
- **Stop** cancels on the server and keeps the partial answer; a refresh never stops anything.
- **Weather API down:** retries with backoff, then cached data (marked as such), else a clear answer.
- **No flash on refresh:** color scheme applied before the first paint; draft and scroll position restored.

See it live: **Model & key → Simulate failures** (weather API errors, slow model, dropped connection).

## Tests

```bash
npm test          # unit: chart rules, stream replay, weather client retries and cached fallback
npm run e2e       # browser (Playwright, installed Chrome): reload mid-answer, dropped connection, API failure,
                  # stop, offline, draft, key check — with a scripted model, no key needed
npm run evals     # the real model on 17 cases: chart decision and kind, tools, every number grounded in data
```

Last eval run (Gemini 3.6 Flash): see [`server/src/evals/results/latest.json`](server/src/evals/results/latest.json).

## Layout

```
shared/   types and schemas used by both sides: chart catalog, units, API
server/   Hono app: agent (instructions, tools, chart rules, models), Open-Meteo client, streams, SQLite
client/   React + Mantine: chat, message parts, now card, charts (Recharts), key panel
e2e/      Playwright tests          PLAN.md   plan and decisions
```

## Notes

- Weather data: [Open-Meteo](https://open-meteo.com/) (free for non-commercial use, CC BY 4.0).
- Free Gemini keys allow only about 20 requests a day on the Flash models; the app then falls back to Flash-Lite
  (marked "backup model" under the answer). A Groq key (free) or a paid key avoids this.
- Your key stays in your browser; it is sent with each question in a header and never stored or logged.
- One server instance: the resumable-stream buffer is in memory (with several instances it would move to Redis).
