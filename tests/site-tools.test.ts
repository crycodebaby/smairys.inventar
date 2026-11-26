import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerInventorySiteTools } from '../src/site-tools.ts';
import type { SiteTool } from '../src/site-tools.ts';

test('site tools validate inputs and unregister all account-scoped tools on sign-out', async () => {
  const tools = new Map<string, SiteTool>();
  const calls: string[] = [];
  const cleanup = registerInventorySiteTools({ registerTool: tool => { tools.set(tool.name, tool); }, unregisterTool: name => { tools.delete(name); } }, async (name) => { calls.push(name); return { items: [] }; });
  assert.equal(tools.size, 7);
  const search = tools.get('inventory_search_inventory')!;
  assert.equal(search.annotations.readOnlyHint, true);
  await search.execute({ query: 'ECC83' });
  assert.deepEqual(calls, ['search_inventory']);
  await assert.rejects(() => search.execute({ owner_id: 'another-owner' }));
  assert.equal(calls.length, 1);
  cleanup();
  assert.equal(tools.size, 0);
});
