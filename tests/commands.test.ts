import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { parseCommand } from '../supabase/functions/_shared/commands.ts';
import { createInventoryMcp } from '../supabase/functions/_shared/mcp.ts';
import { createInventoryHandler } from '../supabase/functions/_shared/handler.ts';

test('commands reject owner injection, missing idempotency key and invalid revisions', () => {
  assert.throws(() => parseCommand('create_item', { title: 'Röhre' }));
  assert.throws(() => parseCommand('search_inventory', { owner_id: 'other-owner' }));
  assert.throws(() => parseCommand('update_item', { operation_id: crypto.randomUUID(), item_id: crypto.randomUUID(), expected_revision: 0, changes: { title: 'Röhre' } }));
  assert.throws(() => parseCommand('execute_sql', { sql: 'select 1' }));
  assert.throws(() => parseCommand('create_label', { operation_id: crypto.randomUUID(), kind: 'marker', name: 'Prüfen', color: 'red' }));
});

test('transcription and interpretation stay separate and default attribution is uncertain', () => {
  const args = parseCommand('add_note', { operation_id: crypto.randomUUID(), item_id: crypto.randomUUID(), title: 'Lothars Aufschrift', verbatim_text: 'alt [3?]', interpretation: 'Lesung offen' });
  assert.equal((args as { attribution: string }).attribution, 'unknown');
  assert.equal((args as { verbatim_text: string }).verbatim_text, 'alt [3?]');
});

test('MCP exposes the seven bounded commands and marks conflicts as tool errors', async () => {
  const server = createInventoryMcp(async (name) => name === 'update_item' ? { error: 'REVISION_CONFLICT', current: { revision: 2 } } : { items: [] });
  const client = new Client({ name: 'inventory-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 7);
    assert.equal(tools.find(tool => tool.name === 'search_inventory')?.annotations?.readOnlyHint, true);
    assert.equal(tools.find(tool => tool.name === 'create_item')?.annotations?.readOnlyHint, false);
    const result = await client.callTool({ name: 'update_item', arguments: { operation_id: crypto.randomUUID(), item_id: crypto.randomUUID(), expected_revision: 1, changes: { title: 'Neu' } } });
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent, { error: 'REVISION_CONFLICT', current: { revision: 2 } });
  } finally {
    await client.close();
    await server.close();
  }
});

const handler = createInventoryHandler({ supabaseUrl: 'https://example.supabase.co', publishableKey: 'test-only', functionUrl: 'https://example.supabase.co/functions/v1/inventory', appOrigin: 'https://inventar.smairys.de' });

test('HTTP commands and MCP reject anonymous access and advertise OAuth discovery', async () => {
  for (const path of ['/mcp', '/commands/search_inventory']) {
    const result = await handler(new Request(`https://example.supabase.co/functions/v1/inventory${path}`, { method: 'POST', body: '{}' }));
    assert.equal(result.status, 401);
    assert.match(result.headers.get('www-authenticate')!, /oauth-protected-resource/);
  }
  const result = await handler(new Request('https://example.supabase.co/functions/v1/inventory/.well-known/oauth-protected-resource'));
  const metadata = await result.json();
  assert.equal(metadata.resource, 'https://example.supabase.co/functions/v1/inventory/mcp');
});

test('unknown paths fail and CORS is restricted to the application', async () => {
  const result = await handler(new Request('https://example.supabase.co/functions/v1/inventory/commands/arbitrary', { method: 'OPTIONS', headers: { origin: 'https://attacker.example' } }));
  assert.equal(result.headers.get('access-control-allow-origin'), null);
  const unknown = await handler(new Request('https://example.supabase.co/functions/v1/inventory/private'));
  assert.equal(unknown.status, 404);
});
