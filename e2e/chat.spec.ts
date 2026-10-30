import { expect, test, type Page } from '@playwright/test';

/** The scripted answer ends with this phrase, so "finished" is easy to detect. */
const END = 'exactly once.';

async function ask(page: Page, text: string) {
  await page.getByLabel('Message').fill(text);
  await page.getByLabel('Message').press('Enter');
}

async function withFaults(page: Page, faults: string[]) {
  await page.addInitScript((f) => {
    localStorage.setItem('breeze:settings', JSON.stringify({ units: 'metric', provider: 'google', model: '', remember: true, faults: f }));
  }, faults);
}

const chatId = (page: Page) => new URL(page.url()).pathname.split('/').pop()!;
const saved = (page: Page) => page.request.get(`/api/chats/${chatId(page)}`).then((r) => r.json());

test('a multi-day question streams an answer with a chart', async ({ page }) => {
  await page.goto('/');
  await page.getByText('What will the weather be like in Tokyo this week?').click();
  await expect(page.getByRole('img', { name: /day forecast/i })).toBeVisible();
  await expect(page.locator('.answer')).toContainText(END);
  await expect(page.getByText(/scripted · \d/)).toBeVisible(); // which model answered, and how long it took
});

test('reloading mid-answer reattaches and finishes the answer exactly once', async ({ page }) => {
  await page.goto('/');
  await ask(page, 'What will the weather be like in Lisbon this week?');
  await expect(page.locator('.answer')).toContainText('outlook'); // the answer is streaming
  await page.reload();

  await expect(page.locator('.answer')).toContainText(END);
  await expect(page.locator('.answer')).toHaveCount(1);
  await expect(page.getByRole('img', { name: /day forecast/i })).toHaveCount(1);
  const chat = await saved(page);
  expect(chat.messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);
});

test('a dropped connection reconnects on its own, without duplicating the answer', async ({ page }) => {
  await withFaults(page, ['drop_stream']);
  await page.goto('/');
  await ask(page, 'What will the weather be like in Oslo this week?');
  await expect(page.locator('.answer')).toContainText(END, { timeout: 30_000 });
  await expect(page.locator('.answer')).toHaveCount(1);
  await expect(page.getByText('The connection was interrupted.')).toHaveCount(0);
});

test('a failing weather API produces a clear answer instead of a crash', async ({ page }) => {
  await withFaults(page, ['weather_error']);
  await page.goto('/');
  await ask(page, 'What will the weather be like in Nairobi this week?');
  await expect(page.locator('.answer')).toContainText('not responding');
  await expect(page.locator('[data-chart]')).toHaveCount(0);
});

test('a "right now" question shows the now card and no chart', async ({ page }) => {
  await page.goto('/');
  await ask(page, 'What is the temperature in Reykjavik right now?');
  await expect(page.getByText(/Feels like/)).toBeVisible();
  await expect(page.locator('.answer')).toContainText(END);
  await expect(page.locator('[data-chart]')).toHaveCount(0);
});

test('stop keeps the partial answer, and it is still there after a reload', async ({ page }) => {
  await page.goto('/');
  await ask(page, 'What will the weather be like in Madrid this week?');
  await expect(page.locator('.answer')).toContainText('outlook');
  await page.getByLabel('Stop the answer').click();
  await expect(page.getByLabel('Send')).toBeVisible();
  await page.reload();
  await expect(page.locator('.answer')).toContainText('outlook');
  await expect(page.locator('.answer')).not.toContainText(END);
  await expect(page.getByText('This answer was interrupted.')).toHaveCount(0);
});

test('the offline banner appears and goes away with the network', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByText('Weather, anywhere')).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText(/You are offline/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/You are offline/)).toHaveCount(0);
});

test('the unsent draft survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Message').fill('Is it windy in Wellington');
  await page.reload();
  await expect(page.getByLabel('Message')).toHaveValue('Is it windy in Wellington');
});

test('the key panel checks a key and explains a rejected one', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /demo key/i }).click();
  await page.getByLabel('API key').fill('not-a-real-key-123456');
  await page.getByRole('button', { name: 'Check models' }).click();
  await expect(page.getByText('Key rejected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
});

test('the logo always opens a fresh home page, even after chatting', async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await page.goto(i === 0 ? '/' : page.url());
    const before = chatId(page);
    await ask(page, 'What will the weather be like in Rome this week?');
    await expect(page.locator('.answer')).toContainText(END);
    await page.getByRole('button', { name: 'Breeze home' }).click();
    await expect(page.getByText('Weather, anywhere')).toBeVisible();
    expect(chatId(page)).not.toBe(before);
  }
});

test('an hour-by-hour question draws the hour-by-hour chart', async ({ page }) => {
  await page.goto('/');
  await ask(page, 'Show me tomorrow hour by hour in Athens');
  const chart = page.getByRole('img', { name: /hour by hour/i });
  await expect(chart).toBeVisible();
  await expect(chart).toHaveAttribute('aria-label', /High .*low /);
  await expect(chart.locator('text', { hasText: /^H$/ })).toHaveCount(1); // the H marker
  await expect(chart.locator('linearGradient')).toHaveCount(2); // temperature-colored line and fill
  await expect(page.locator('.answer')).toContainText(END);
});

test('on an empty chat, the logo and "+" stay put instead of opening another one', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Weather, anywhere')).toBeVisible();
  const before = chatId(page);
  await page.getByRole('button', { name: 'Breeze home' }).click();
  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(page.getByLabel('Message')).toBeFocused();
  expect(chatId(page)).toBe(before);
});

test('a suggested follow-up under the answer asks the next question', async ({ page }) => {
  await page.goto('/');
  await ask(page, 'What will the weather be like in Tokyo this week?');
  await expect(page.locator('.answer')).toContainText(END);
  const suggestions = page.getByRole('group', { name: 'Suggested questions' });
  await suggestions.getByRole('button', { name: 'Hour by hour tomorrow' }).click();
  await expect(page.locator('.bubble-user').last()).toHaveText(/^Hour by hour tomorrow in Tokyo/);
  await expect(page.getByRole('img', { name: /hour by hour/i })).toBeVisible();
});

test('speaking a question fills the input without sending it', async ({ page }) => {
  // A stand-in for the browser's speech recognizer: it "hears" a question in two parts.
  await page.addInitScript(() => {
    class FakeRecognition {
      onresult: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror = null;
      start() {
        setTimeout(() => this.onresult?.({ results: [[{ transcript: 'Will it rain' }]] }), 50);
        setTimeout(() => (this.onresult?.({ results: [[{ transcript: 'Will it rain in Oslo tomorrow' }]] }), this.onend?.()), 150);
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Speak your question' }).click();
  await expect(page.getByLabel('Message')).toHaveValue('Will it rain in Oslo tomorrow');
  await expect(page.locator('.bubble-user')).toHaveCount(0);
});

test('a chat opened from someone else’s link is read-only and can be continued as a copy', async ({ page, browser }) => {
  await page.goto('/');
  await ask(page, 'What will the weather be like in Oslo this week?');
  await expect(page.locator('.answer')).toContainText(END);
  const link = page.url();

  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await expect(other.locator('.answer')).toContainText(END);
  await expect(other.getByLabel('Message')).toHaveCount(0);
  // Not in the other visitor's recent chats.
  expect(await other.evaluate(() => fetch('/api/chats', { headers: { 'x-breeze-client': localStorage.getItem('breeze:client') ?? '' } }).then((r) => r.json()))).toEqual([]);

  await other.getByRole('button', { name: 'Continue as my chat' }).click();
  await expect(other.getByLabel('Message')).toBeVisible();
  expect(other.url()).not.toBe(link);
  await expect(other.locator('.answer')).toContainText(END);
  await other.context().close();
});

test('the key panel shows which models a key can use, and saves the one picked', async ({ page }) => {
  // Stand-in provider answers, one per model, arriving at different times.
  const answers: Record<string, { status: string; message: string; latencyMs?: number; delay: number }> = {
    'gemini-3.6-flash': { status: 'ok', message: 'Key works.', latencyMs: 900, delay: 100 },
    'gemini-3.5-flash': { status: 'rate_limited', message: 'The key works, but its quota is used up.', delay: 50 },
    'gemini-3.5-flash-lite': { status: 'ok', message: 'Key works.', latencyMs: 400, delay: 150 },
    'gemini-3.8-flash': { status: 'no_model_access', message: 'This key cannot use gemini-3.8-flash.', delay: 800 },
  };
  await page.route('**/api/keys/check', async (route) => {
    const { model } = route.request().postDataJSON();
    const { delay, ...answer } = answers[model];
    await new Promise((r) => setTimeout(r, delay));
    await route.fulfill({ json: { provider: 'google', model, ...answer } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /demo key/i }).click();
  await page.getByLabel('API key').fill('test-key-0000000000');
  await page.getByRole('button', { name: 'Check models' }).click();

  const models = page.getByRole('radiogroup', { name: 'Models' });
  await expect(models.getByText('Works · 0.9 s')).toBeVisible();
  await expect(models.getByText('Quota used up')).toBeVisible();
  await expect(models.getByText('Not available')).toBeVisible();
  await expect(models.getByRole('radio', { name: /gemini-3\.6-flash/ })).toHaveAttribute('aria-checked', 'true');
  await expect(models.getByRole('radio', { name: /gemini-3\.8-flash/ })).toBeDisabled();

  await models.getByRole('radio', { name: /gemini-3\.5-flash-lite/ }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('breeze:settings') ?? '{}').model)).toBe('gemini-3.5-flash-lite');
});
