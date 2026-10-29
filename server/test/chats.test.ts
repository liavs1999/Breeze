import { describe, expect, it } from 'vitest';
import { CLIENT_HEADER } from '@wwa/shared';
import { app } from '../src/app';
import { getChat, saveChat } from '../src/db';

const ALICE = 'alice-browser-000000';
const BOB = 'bob-browser-00000000';
const as = (client: string | null, init: RequestInit = {}) => ({
  ...init,
  headers: { 'content-type': 'application/json', ...(client ? { [CLIENT_HEADER]: client } : {}) },
});
const message = { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Weather in Oslo?' }] };

describe('chats belong to the browser that started them', () => {
  saveChat('alice-chat-1', [message as any], ALICE);

  it('lists a chat only for its owner', async () => {
    const list = async (client: string | null) => (await (await app.request('/api/chats', as(client))).json()).map((c: any) => c.id);
    expect(await list(ALICE)).toContain('alice-chat-1');
    expect(await list(BOB)).not.toContain('alice-chat-1');
    expect(await list(null)).toEqual([]);
  });

  it('opens by link for anyone, read-only for others', async () => {
    const open = async (client: string) => (await app.request('/api/chats/alice-chat-1', as(client))).json();
    expect(await open(ALICE)).toMatchObject({ readOnly: false, title: 'Weather in Oslo?' });
    expect(await open(BOB)).toMatchObject({ readOnly: true, title: 'Weather in Oslo?' });
  });

  it('refuses to continue, stop or delete someone else’s chat', async () => {
    const post = await app.request('/api/chat', as(BOB, { method: 'POST', body: JSON.stringify({ id: 'alice-chat-1', message: { ...message, id: 'm2' } }) }));
    expect(post.status).toBe(403);
    expect((await app.request('/api/chats/alice-chat-1/stop', as(BOB, { method: 'POST' }))).status).toBe(403);
    expect((await app.request('/api/chats/alice-chat-1', as(BOB, { method: 'DELETE' }))).status).toBe(403);
    expect(getChat('alice-chat-1')?.messages).toHaveLength(1);
  });

  it('copies a shared chat into one of your own', async () => {
    const res = await app.request('/api/chats/alice-chat-1/copy', as(BOB, { method: 'POST', body: JSON.stringify({ to: 'bob-copy-1' }) }));
    expect(res.status).toBe(200);
    expect(getChat('bob-copy-1')).toMatchObject({ owner: BOB, messages: [message] });
    expect(getChat('alice-chat-1')?.owner).toBe(ALICE);
  });

  it('lets the owner delete', async () => {
    expect((await app.request('/api/chats/alice-chat-1', as(ALICE, { method: 'DELETE' }))).status).toBe(204);
    expect(getChat('alice-chat-1')).toBeNull();
  });
});
