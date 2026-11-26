import { z } from 'zod';
import { commandDescriptions, commandNames, commandSchemas, parseCommand, readCommands } from '../supabase/functions/_shared/commands.ts';

export interface SiteTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean };
  execute: (input: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

export interface SiteToolRegistry {
  registerTool(tool: SiteTool): void;
  unregisterTool(name: string): void;
}

declare global {
  interface Navigator { modelContext?: SiteToolRegistry }
}

export function registerInventorySiteTools(registry: SiteToolRegistry, execute: (name: string, input: unknown) => Promise<unknown>) {
  const registered: string[] = [];
  try {
    for (const name of commandNames) {
      const toolName = `inventory_${name}`;
      registry.registerTool({
        name: toolName,
        description: commandDescriptions[name],
        inputSchema: z.toJSONSchema(commandSchemas[name], { io: 'input' }),
        annotations: { readOnlyHint: readCommands.has(name) },
        execute: async (input) => ({ content: [{ type: 'text', text: JSON.stringify(await execute(name, parseCommand(name, input))) }] }),
      });
      registered.push(toolName);
    }
  } catch (error) {
    for (const name of registered) registry.unregisterTool(name);
    throw error;
  }
  return () => { for (const name of registered) registry.unregisterTool(name); };
}
