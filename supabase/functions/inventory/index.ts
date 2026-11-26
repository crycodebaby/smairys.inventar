import { createInventoryHandler } from '../_shared/handler.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
const publishableKey = Object.values(keys)[0] as string | undefined ?? Deno.env.get('SUPABASE_ANON_KEY');
if (!supabaseUrl || !publishableKey) throw new Error('Supabase configuration is missing.');

Deno.serve(createInventoryHandler({
  supabaseUrl,
  publishableKey,
  functionUrl: `${supabaseUrl}/functions/v1/inventory`,
  appOrigin: 'https://inventar.smairys.de',
}));
