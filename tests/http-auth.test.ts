import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInventoryHandler } from '../supabase/functions/_shared/handler.ts';

test('signed user requests reach the owner-scoped command RPC; MCP also requires a resource audience', async () => {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = { ...await crypto.subtle.exportKey('jwk', key.publicKey), kid: 'test-key', alg: 'ES256', use: 'sig' };
  const base = 'https://example.supabase.co';
  const functionUrl = `${base}/functions/v1/inventory`;
  const calls: unknown[] = [];
  const handler = createInventoryHandler({ supabaseUrl: base, publishableKey: 'test-publishable', functionUrl, appOrigin: 'https://inventar.smairys.de', fetch: async (input, init) => {
    const url = String(input);
    if (url.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [publicKey] });
    if (url.endsWith('/rpc/inventory_command')) { calls.push(JSON.parse(init!.body as string)); return Response.json({ items: [] }); }
    throw new Error(`Unexpected request ${url}`);
  } });
  async function token(extra: Record<string, unknown> = {}) {
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'test-key', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: crypto.randomUUID(), role: 'authenticated', iss: `${base}/auth/v1`, aud: 'authenticated', exp: Math.floor(Date.now()/1000) + 300, ...extra })).toString('base64url');
    const unsigned = `${header}.${payload}`;
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, new TextEncoder().encode(unsigned));
    return `${unsigned}.${Buffer.from(signature).toString('base64url')}`;
  }
  const sessionToken = await token();
  const request = (path: string, bearer: string, body: string) => new Request(functionUrl + path, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', accept: 'application/json, text/event-stream' }, body });
  const result = await handler(request('/commands/search_inventory', sessionToken, '{}'));
  assert.equal(result.status, 200);
  assert.deepEqual(calls, [{ command_name: 'search_inventory', arguments: { query: '', limit: 20, offset: 0 } }]);
  const injected = await handler(request('/commands/search_inventory', sessionToken, '{"owner_id":"other"}'));
  assert.equal(injected.status, 400);
  assert.equal(calls.length, 1);
  assert.equal((await handler(request('/mcp', sessionToken, '{}'))).status, 401);
  const oauthToken = await token({ aud: ['authenticated', `${functionUrl}/mcp`], client_id: crypto.randomUUID() });
  const initialized = await handler(request('/mcp', oauthToken, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'http-test', version: '1.0.0' } } })));
  assert.equal(initialized.status, 200);
  const initializedBody = await initialized.json();
  assert.equal(initializedBody.result.serverInfo.name, 'smairys-inventar');
  const forged = await handler(request('/commands/search_inventory', sessionToken.slice(0, -20) + 'forged', '{}'));
  assert.equal(forged.status, 401);
  const tooLarge = await handler(request('/commands/search_inventory', sessionToken, 'x'.repeat(66000)));
  assert.equal(tooLarge.status, 413);
});
