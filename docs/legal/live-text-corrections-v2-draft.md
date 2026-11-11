# Corrections to factually wrong statements on live legal pages (v2 drafts, PRIORITY)

> **DRAFT — for director sign-off; not published.**
> - Prepared 2026-11-11 by the playbook lane.
> - These replace statements that are false today.
> - Publish together with a version bump (`src/lib/legal.ts` `LEGAL.version`).
> - The texts below are exactly what would replace the current ones.

## P1. `/terms` §9 "Problems and disputes" (`src/app/(legal)/terms/page.tsx`, line 76)

**Now (false: under DEC-107 Gala Dock never holds funds or decides):**
> Contact the other party first. If you can’t resolve it, open a dispute from the booking or contact support@galadock.com. We will review the evidence and the saved booking terms, and we may decide how the funds we hold are released or refunded. This does not prevent you from going to court or using an approved alternative dispute resolution scheme.

**Replace with:**
> Contact the other party first. If you can’t resolve it, open a dispute from the booking within 24 hours after the event ends, or contact support@galadock.com.
>
> Gala Dock does not hold your money: payments go to the seller’s own Stripe account. While a dispute is open, the payment is not paid out to the seller.
>
> We may review the evidence and the saved booking terms and give a recommendation, but we do not decide disputes. Money moves only when:
> - you both accept the recommendation;
> - you settle;
> - an independent body or court decides; or
> - the payment provider’s hold limit is reached and the default rule in the Payment Terms applies.
>
> Consumers are never required to use arbitration for claims of £5,000 or less. This does not prevent you from going to court or using an alternative dispute resolution scheme. See the Disputes Policy and the Payment Terms.

## P2. `/privacy`: Anthropic listed as a processor (`src/app/(legal)/privacy/page.tsx`, line 58)

**Now (false: product AI is Azure OpenAI only, owner decision 2026-10-28; `@anthropic-ai/sdk` removed):**
> Anthropic: AI processing for some assistant features, such as onboarding help

**Replace with:**
> Microsoft (Azure OpenAI Service): AI processing for Gala Agent and assistant features (organiser and provider workspaces only). Prompts and outputs are not used to train Microsoft’s models.

Owner to confirm the Azure region before publishing, and add "processed in the UK/EU" only if confirmed.

## P3. `/privacy` §8 and `/data-retention`: backups (UK GDPR retention decision, cross-brand notes §5)

**Now:** no statement about backups.

**Add to `/privacy` §8 "How long we keep data":**
> **Backups.** We keep encrypted backups so we can recover from failures. Supabase keeps daily backups for 7 days. Our own encrypted copies are kept for up to 63 days: hourly and daily copies for up to 8 days, weekly copies for up to 29 days, and monthly copies for up to 63 days. Deleted data therefore leaves every backup within 65 days. If we ever restore from a backup, we apply your earlier deletion or erasure requests again before the data is used.

**Add a row to `/data-retention`:**

| Data | Kept for | Legal basis |
|---|---|---|
| Encrypted backups of all the above | Removed from every backup within 65 days of deletion; erasures re-applied after any restore | Security of processing and resilience (UK GDPR Art. 32); storage limitation (Art. 5(1)(e)) |
