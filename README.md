# Atmos: a weather chat agent

Ask about the weather anywhere in the world: forecasts, past weather, "was this normal?", air quality. An AI agent
fetches real data through tools, answers stream in as they are written, and questions about a period or a comparison
come with a chart.

**Live demo:** _link coming with the first deploy_ · **Deploy your own:** [one click on Render](#deploy-your-own)

| Hour by hour, with the chart the agent chose | Comparing places (dark mode) |
|---|---|
| ![An hour-by-hour forecast for Tel Aviv with a temperature line, H and L markers and follow-up suggestions](docs/hourly.png) | ![A comparison of Paris, Rome and Madrid over five days, one line per city](docs/compare.png) |

## Contents

- [Try it](#try-it)
- [What it does](#what-it-does)
- [Run it locally](#run-it-locally)
- [Deploy your own](#deploy-your-own)
- [When does the agent draw a chart?](#when-does-the-agent-draw-a-chart)
- [How it works](#how-it-works)
- [Streaming and resilience](#streaming-and-resilience)
- [Privacy and security](#privacy-and-security)
- [Tests and evals](#tests-and-evals)
- [Project layout](#project-layout)
- [Limits and next steps](#limits-and-next-steps)

## Try it

Open the demo and tap an example, or ask your own question:

- *What will the weather be like in Tokyo this week?* → a 7-day forecast
- *Will it rain in London in the next 24 hours?* → hour by hour, with the chance of rain
- *Compare Paris, Rome and Madrid over the next 5 days* → one line per city
- *Was last month warmer than normal in New York?* → the difference from the 1991–2020 normal
- *What's the temperature in Reykjavík right now?* → a "now" card, no chart
- *How's the air quality in Delhi over the next few days?* → the air quality index by level
- *Weather in Springfield tomorrow* → the agent asks which Springfield, with the options as buttons

Follow-ups work as in any chat (*"and in Porto?"*, *"what about the weekend?"*), and each answer offers two or three
next questions. The microphone in the input box lets you speak a question instead of typing it.

The demo answers with a shared free Gemini key: up to 20 answers per visitor per hour, within the free tier's daily quota. Under **Model & key** (top right)
you can paste your own key for Gemini, Groq, Anthropic or OpenAI; it is checked on the spot and stays in your browser.

## What it does

- **Real data, never invented.** Forecasts up to 16 days, hourly up to 7 days, past weather back to 1940, normals,
  air quality: all from [Open-Meteo](https://open-meteo.com/). Every number on a chart comes from the API, not the
  model.
- **Charts when they help.** A chart catalog of six kinds; the agent decides when to draw one, the server enforces the
  rules ([details](#when-does-the-agent-draw-a-chart)). Every chart has a **Data** toggle showing the same values as a
  table.
- **Streaming that survives a refresh.** Answers keep running on the server; reload the page, lose the connection or
  go offline, and the answer finishes in place, exactly once.
- **Any model.** Gemini by default (free), or Groq, Anthropic or OpenAI with your own key. On the demo key, a backup
  model takes over when the main one is rate-limited.
- **°C or °F**, light or dark (following your system), and a layout that works on a phone.
- **Private chats.** Each browser sees only its own chats; a chat's link opens read-only for anyone else.
- **Dictation** with the browser's own speech recognition (Chrome, Edge, Safari).

## Run it locally

### Requirements

- **Node 22.12 or later** (the server uses Node's built-in SQLite), or Docker.
- **An LLM key** for the server, or paste one in the app instead. A free
  [Google Gemini key](https://aistudio.google.com/apikey) works; so do [Groq](https://console.groq.com/keys) (free),
  [Anthropic](https://console.anthropic.com/settings/keys) and [OpenAI](https://platform.openai.com/api-keys) keys.
- No key is needed for the weather data.

### Quick start

```bash
git clone https://github.com/liavs1999/weather-chat.git
cd weather-chat
npm install
cp server/.env.example server/.env     # then add your key to server/.env (optional)
npm run dev                            # API on :8787 and the web app on http://localhost:5180
```

Open http://localhost:5180. Without a key in `server/.env`, the app asks for one under **Model & key**.

To run the two halves separately: `npm run dev -w server` (API on :8787) and `npm run dev -w client` (web app on
:5180, forwarding `/api` to the server).

### Production build, one port

```bash
npm run build && npm start             # → http://localhost:8787
```

The server then serves the built web app and the API on the same port.

### With Docker

```bash
docker compose up --build              # → http://localhost:8787, reads server/.env, keeps chats in a volume
```

Or without Compose:

```bash
docker build -t atmos .
docker run -p 8787:8787 -e GOOGLE_GENERATIVE_AI_API_KEY=<your key> -v atmos-data:/data atmos
```

### Settings

All optional. Put them in `server/.env` locally, or in your host's environment settings.

| Variable | Default | What it does |
|---|---|---|
| `LLM_PROVIDER` | the first provider with a key | `google`, `groq`, `anthropic` or `openai` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | | the server's own key for Gemini (likewise `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) |
| `LLM_API_KEY` | | one key for whichever provider is chosen, instead of the provider-specific name |
| `LLM_MODEL` | per provider (`gemini-3.6-flash`, `openai/gpt-oss-120b`, `claude-haiku-4-5-20251001`, `gpt-5-mini`) | the model id |
| `DEMO_ANSWERS_PER_HOUR` | `30` | answers per visitor per hour when the server's key is used |
| `MAX_AGENT_STEPS` | `8` | the most tool-calling steps for one answer |
| `PORT` | `8787` | the port the server listens on (`API_PORT` wins if both are set) |
| `DB_PATH` | `server/data/app.db` (`/data/app.db` in Docker) | the SQLite file for chats and the weather cache |
| `ALLOW_FAULTS` | on in development, off in production | failure injection for the browser tests |

A visitor's own key (from **Model & key**) always wins over the server's key.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | server and web app with live reload |
| `npm run build` / `npm start` | production build, then serve everything on one port |
| `npm test` | unit tests (no key needed) |
| `npm run e2e` | browser tests with Playwright and your installed Chrome (no key needed) |
| `npm run evals` | the real model on 17 cases (needs a key) |
| `npm run typecheck` / `npm run lint` | TypeScript and oxlint |

## Deploy your own

The repo is ready for [Render](https://render.com)'s free plan: [`render.yaml`](render.yaml) describes one web
service built from the [`Dockerfile`](Dockerfile).

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/liavs1999/weather-chat)

1. Click **Deploy to Render** above and sign in (with GitHub is quickest).
2. Render reads `render.yaml` and asks for `GOOGLE_GENERATIVE_AI_API_KEY`. Paste a Gemini key; it becomes the demo
   key that answers for visitors who have not added their own. Left empty, every visitor must bring a key.
3. Click **Deploy Blueprint** (or **Apply**). The first build takes about five minutes.
4. Open the service's `onrender.com` link. `/api/health` should report `"serverKey":{"provider":"google",…}`.

Every push to `main` deploys again on its own.

What the free plan means:

- **It sleeps after 15 minutes without visitors.** The next visit wakes it, which takes about a minute.
- **Chats reset when it sleeps or redeploys,** because the free plan has no disk. To keep them, use a paid instance
  with a disk mounted at `/data`; nothing in the app changes.
- **One instance.** Answers in progress are buffered in memory, so the app runs as a single instance (see
  [Limits](#limits-and-next-steps)).

**Other hosts.** Anything that runs a Docker image works the same way: set the key, expose the port given in `PORT`,
and mount a volume at `/data` if chats should survive restarts. The server needs to stream responses
(server-sent events), so avoid proxies that buffer them.

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

**No chart** for a single value or "right now" (*"What's the temperature in Reykjavík right now?"* shows a compact
"now" card instead), for three or fewer data points, for follow-ups that bring no new data (*"…in Fahrenheit?"*),
or when you ask for text only.

**How it is enforced.** The rules for the model are in
[`server/src/agent/instructions.ts`](server/src/agent/instructions.ts). The server-side checks in
[`server/src/agent/charts.ts`](server/src/agent/charts.ts) reject a chart that breaks them (too few points, the wrong
kind for the data, a comparison of one place) and tell the agent why, so it answers in text instead. When the data
qualifies for a chart and none was drawn, the next step's instructions restate the rule, which keeps smaller models
consistent. [`server/src/evals/cases.ts`](server/src/evals/cases.ts) tests the decisions against the real model, and
the rendering lives in [`client/src/charts/`](client/src/charts).

## How it works

```
client (React, Mantine) ──POST /api/chat──▶ server (Hono, Node)
   useChat: streams text,                      agent: AI SDK tool loop (max 8 steps)
   tool steps, cards, charts ◀──SSE stream───    tools → Open-Meteo (geocoding, forecast, history, air quality)
                                                 show_chart → chart rules → chart built from stored data
                                                 SQLite: chats + API cache · stream buffer: resumable answers
```

**One question, start to finish.**

1. The browser sends only the newest message, with the units, its timezone, its anonymous id and (if added) the
   visitor's key. The server keeps the conversation.
2. The server loads the chat, checks it belongs to this browser, picks the model (the visitor's key, else the
   server's) and applies the per-visitor limit for the demo key.
3. The agent runs a tool loop: it fetches what it needs, optionally draws a chart, then writes a short answer. Each
   step is logged with its tools, tokens and model.
4. The answer is written into an in-memory buffer that any number of connections can follow. A reload reattaches
   with `GET /api/chat/:id/stream`: a full replay, then live.
5. When it finishes, the chat is saved with which model answered, how long it took and the tokens used, shown under
   the answer.

**Tools.** Six tools, shaped around what the user asks rather than around API endpoints:

| Tool | What it does |
|---|---|
| `find_place` | looks up an ambiguous name ("Springfield") so the agent can ask which one |
| `get_current` | conditions right now and today's range; shown as the "now" card |
| `get_forecast` | daily up to 16 days, or hourly up to 7 days (or one named day, such as tomorrow) |
| `get_history` | past days since 1940, optionally with the 1991–2020 normal for each day |
| `get_air_quality` | the European air quality index and PM2.5 for up to 5 days |
| `show_chart` | draws one of six chart kinds from data already fetched, by dataset id |

Every data tool resolves the place name itself, which saves a step. It returns a compact summary in the user's units;
the full series stays on the server under a dataset id that charts refer to. Inputs are strict schemas (zod) shared
with the client. Errors come back as instructions the model can act on, for example "Only 3 data points: answer in
text instead".

**Models.** One setting switches the provider ([`server/src/agent/models.ts`](server/src/agent/models.ts)). With
Gemini, a rate limit or an overloaded model hands the call to the next model (3.6 Flash, then 3.5 Flash,
then 3.5 Flash-Lite). A model that reports a spent quota is skipped until the time the provider gives, so later
answers do not waste calls on it. The answer is then marked "backup model".

**Data.** Open-Meteo's geocoding, forecast, historical (ERA5) and air quality APIs. Calls retry with backoff and are
cached in SQLite; when the API fails, a cached copy is used and the answer says the data may be a few hours old.

**Stack.** TypeScript end to end: [Hono](https://hono.dev) on Node 22, the [AI SDK](https://ai-sdk.dev) for the
agent and streaming, SQLite (`node:sqlite`), React with [Mantine](https://mantine.dev) and
[Recharts](https://recharts.org), Vite, Vitest, Playwright.

## Streaming and resilience

- **Refresh mid-answer:** the answer keeps running on the server; the page reloads the saved chat and reattaches
  to the stream (full replay, then live), so it finishes in place, exactly once.
- **Dropped connection or offline:** an offline banner, then an automatic reconnect with backoff.
- **Stop** cancels on the server and keeps the partial answer; a refresh never stops anything.
- **Weather API down:** retries with backoff, then cached data (marked as such), else a clear answer.
- **Model rate-limited:** a backup model answers, and the answer says so.
- **No flash on refresh:** color scheme applied before the first paint; draft and scroll position restored.

The browser tests show each of these with injected failures (weather API errors, a slow model, a dropped
connection); the injection is off in production.

## Privacy and security

- **Keys.** A visitor's key stays in their browser (local storage, or this tab only if "remember" is off). It travels
  to the server as a header with each question, is used for that answer, and is never stored or logged. The
  server's own key lives only in the host's environment; `server/.env` is ignored by git.
- **Chats.** Each browser makes up a random anonymous id and sends it with every request. The server lists,
  continues, stops and deletes a chat only for the browser that started it. A chat's link opens for anyone,
  read-only, and "Continue as my chat" makes them their own copy. There are no accounts: another browser, a private
  window or cleared site data starts a new identity.
- **Limits.** Answers on the demo key are limited per visitor per hour, key checks per minute, and messages to 2,000
  characters.
- **Dictation** uses the browser's speech recognition; Chrome sends the audio to Google to transcribe it. Nothing is
  sent to the chat until you press send.
- **Stored on the server:** chats (messages, tool results and charts) and cached weather responses, in one SQLite file.

## Tests and evals

```bash
npm test          # unit: chart rules, stream replay, weather client retries and cached fallback, place hints,
                  # chat ownership
npm run e2e       # browser (Playwright, installed Chrome): reload mid-answer, dropped connection, API failure,
                  # stop, offline, draft, key check, follow-ups, dictation, shared chats — with a scripted model,
                  # no key needed
npm run evals     # the real model on 17 cases: chart decision and kind, tools, every number grounded in data
```

The browser tests run against the production build with a scripted model, so they are fast, free and repeatable.
The evals use the real model and check that it charts when it should (and only then), picks the right chart and
tools, and that every number in the answer appears in the data it fetched. Last run (Gemini 3.6 Flash, 17 of 17):
[`server/src/evals/results/latest.json`](server/src/evals/results/latest.json).

## Project layout

```
shared/   types and schemas used by both sides: chart catalog, units, weather codes, API
server/   Hono app: routes, agent (instructions, tools, chart rules, models), Open-Meteo client,
          resumable streams, SQLite; unit tests and evals
client/   React + Mantine: chat, message parts, now card, charts (Recharts), suggestions, key panel
e2e/      Playwright browser tests
docs/     screenshots
PLAN.md   the plan and the decisions behind it
```

## Limits and next steps

- **One server instance.** Answers in progress are buffered in memory. With several instances the buffer would move
  to Redis and the chats to Postgres.
- **Free Gemini keys are tight:** about 20 requests a day on the Flash models, and one answer takes two to four. The
  app then falls back to Flash-Lite. A Groq key (free) or a paid key avoids this.
- **Units in text.** Switching °C/°F converts the charts at once; an answer already written stays in its units.
- **No accounts.** Chats are tied to the browser. A sign-in would let them follow you across devices.
- **Not yet:** right-to-left layout for Hebrew and Arabic, sunrise and sunset, and typical weather for dates beyond
  the 16-day forecast.

## Credits

Weather data by [Open-Meteo](https://open-meteo.com/) (CC BY 4.0, free for non-commercial use). Icons by
[Tabler](https://tabler.io/icons).
