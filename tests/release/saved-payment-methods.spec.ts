import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function fixture(mode: 'empty' | 'provider-failure' | 'database-failure' | 'cards') {
  const db = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { stripe_customer_id: mode === 'empty' ? null : 'cus_fixture' }, error: mode === 'database-failure' ? { message: 'unavailable' } : null }) }) }) }) };
  const stripe = async (path: string) => {
    if (mode === 'provider-failure') throw new Error('provider_unavailable');
    return path.startsWith('customers/') ? { invoice_settings: { default_payment_method: 'pm_fixture' } } : { data: [{ id: 'pm_fixture', card: { brand: 'visa', last4: '1234', exp_month: 3, exp_year: 2030 } }] };
  };
  const loaded = { exports: {} as { savedCards: (ctx: unknown) => Promise<{ cards: unknown[]; unavailable: boolean }> } };
  const require = (name: string) => name === 'server-only' ? {} : name === '@/lib/stripe' ? { stripe, stripeMode: () => 'test' } : name === '@/lib/supabase/admin' ? { createAdminClient: () => db } : (() => { throw new Error(name); })();
  const code = ts.transpileModule(readFileSync('src/lib/payments.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { module: loaded, exports: loaded.exports, require, Error });
  return () => loaded.exports.savedCards({ user: { id: 'fixture' } });
}
for (const mode of ['empty', 'provider-failure', 'database-failure', 'cards'] as const) test(`saved cards distinguish ${mode}`, async () => {
  const result = await fixture(mode)();
  expect(result.unavailable).toBe(mode.endsWith('failure'));
  expect(result.cards.length).toBe(mode === 'cards' ? 1 : 0);
  if (mode === 'cards') expect(result.cards[0]).toEqual({ id: 'pm_fixture', brand: 'visa', last4: '1234', exp: '03/2030', wallet: null, isDefault: true });
});
