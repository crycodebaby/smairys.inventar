import { createClient } from '@supabase/supabase-js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { ZodError } from 'zod';
import { parseCommand } from './commands.ts';
import { createInventoryMcp } from './mcp.ts';

export interface InventoryConfig {
  supabaseUrl: string;
  publishableKey: string;
  functionUrl: string;
  appOrigin: string;
  fetch?: typeof fetch;
}

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const metadataPath = '/.well-known/oauth-protected-resource';

export function createInventoryHandler(config: InventoryConfig) {
  const resource = `${config.functionUrl}/mcp`;
  const metadataUrl = `${config.functionUrl}${metadataPath}`;
  const challenge = `Bearer resource_metadata="${metadataUrl}"`;

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const headers = new Headers(jsonHeaders);
    const origin = request.headers.get('origin');
    if (origin === config.appOrigin || origin === 'http://localhost:5173') {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Vary', 'Origin');
      headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, mcp-protocol-version');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate');
    }
    const response = (value: unknown, status = 200) => Response.json(value, { status, headers });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method === 'GET' && url.pathname.endsWith('/health')) return response({ name: 'smairys.inventar', version: '0.1.0', status: 'ready' });
    if (request.method === 'GET' && url.pathname.endsWith(metadataPath)) {
      return response({ resource, authorization_servers: [`${config.supabaseUrl}/auth/v1`], scopes_supported: ['openid'], resource_name: 'smairys.inventar' });
    }
    const isMcp = url.pathname.endsWith('/mcp');
    const commandMatch = url.pathname.match(/\/commands\/([a-z_]+)$/);
    if (!isMcp && !commandMatch) return response({ error: 'NOT_FOUND' }, 404);
    if (request.method !== 'POST') return response({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (Number(request.headers.get('content-length') ?? 0) > 65536) return response({ error: 'PAYLOAD_TOO_LARGE' }, 413);

    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      headers.set('WWW-Authenticate', challenge);
      return response({ error: 'AUTHENTICATION_REQUIRED' }, 401);
    }
    const client = createClient(config.supabaseUrl, config.publishableKey, {
      global: { headers: { Authorization: authorization }, fetch: config.fetch },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice(7);
    const { data, error } = await client.auth.getClaims(token);
    if (error || !data?.claims.sub || data.claims.role !== 'authenticated' || data.claims.iss !== `${config.supabaseUrl}/auth/v1`) {
      headers.set('WWW-Authenticate', challenge);
      return response({ error: 'INVALID_TOKEN' }, 401);
    }
    if (isMcp) {
      const audiences = Array.isArray(data.claims.aud) ? data.claims.aud : [data.claims.aud];
      if (!data.claims.client_id || !audiences.includes(resource)) {
        headers.set('WWW-Authenticate', challenge);
        return response({ error: 'MCP_TOKEN_AUDIENCE_REQUIRED' }, 401);
      }
    }

    const execute = async (name: string, input: unknown) => {
      const args = parseCommand(name, input);
      const { data: result, error: commandError } = await client.rpc('inventory_command', { command_name: name, arguments: args });
      if (commandError) {
        if (commandError.code === '23505') throw new Error('LABEL_NAME_CONFLICT');
        if (['22023', '22P02', '23514', '23502'].includes(commandError.code)) throw new Error('INVALID_ARGUMENTS');
        const known = ['IDEMPOTENCY_CONFLICT', 'ITEM_NOT_FOUND', 'LABEL_NOT_FOUND', 'UNKNOWN_COMMAND', 'INVALID_ARGUMENTS'];
        throw new Error(known.find(code => commandError.message.includes(code)) ?? 'COMMAND_FAILED');
      }
      return result as Record<string, unknown>;
    };

    try {
      // Bound the real body even when Content-Length is omitted or incorrect.
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > 65536) { await reader.cancel(); return response({ error: 'PAYLOAD_TOO_LARGE' }, 413); }
            chunks.push(next.value);
          }
        } finally { reader.releaseLock(); }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const body = new TextDecoder().decode(bytes);
      if (isMcp) {
        const server = createInventoryMcp(execute);
        const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        await server.connect(transport);
        try {
          const result = await transport.handleRequest(new Request(request.url, { method: 'POST', headers: request.headers, body }));
          const resultBody = await result.text();
          for (const [key, value] of headers) if (!result.headers.has(key)) result.headers.set(key, value);
          return new Response(resultBody, { status: result.status, headers: result.headers });
        } finally {
          await server.close();
        }
      }
      const result = await execute(commandMatch![1], JSON.parse(body));
      return response(result, result.error === 'REVISION_CONFLICT' ? 409 : 200);
    } catch (error) {
      if (error instanceof ZodError) return response({ error: 'INVALID_ARGUMENTS', issues: error.issues }, 400);
      if (error instanceof SyntaxError) return response({ error: 'INVALID_JSON' }, 400);
      const message = error instanceof Error ? error.message : 'COMMAND_FAILED';
      const known = ['REVISION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'LABEL_NAME_CONFLICT', 'ITEM_NOT_FOUND', 'LABEL_NOT_FOUND', 'UNKNOWN_COMMAND', 'INVALID_ARGUMENTS'];
      const code = known.find(value => message.includes(value));
      const status = code?.includes('CONFLICT') ? 409 : code?.endsWith('NOT_FOUND') ? 404 : code ? 400 : 500;
      return response({ error: code ?? 'COMMAND_FAILED' }, status);
    }
  };
}
