# Original-method resale settlement evidence

Migration `202610280027_resale_liability_accounting.sql` is applied to the linked database. It captures private seller allocations before the resale hold disappears, enforces service-only settlement, and corrects legacy workspace credits using balanced immutable adjustments. Buyer-readable checkout records do not disclose seller identifiers.

Resale payment journals now credit each seller's liability. Successful original-method refunds clear that liability and reclassify the refund expense; the existing cumulative cash webhook remains the single cash-refund journal. Atomic settlement preserves a failed reconciliation as unresolved even when the provider has succeeded. Retry retrieves the recorded provider refund rather than requesting another payment movement.

| Check | Evidence | Result |
|---|---|---|
| Actual worker and payment journal boundaries | `artifacts/pwa/finish-liability-unit-retry.log` | 15 passed, including split sellers, wrong amount/currency, provider states and settlement failure |
| Linked database, transaction rolled back | `artifacts/pwa/finish-liability-database.log` | Legacy correction, zero remaining seller liability, idempotent settlement, exact amount and client privilege denial passed |
| Real Stripe sandbox original-method refund | `artifacts/pwa/finish-resale-sandbox-refund.log` | £42 test-mode refund succeeded; payout paid; replay created zero refunds |

The real-provider run independently verified both recorded checkout sessions and payment intents were test mode, paid, correctly linked, undisputed and refundable. It claimed one eligible pending sandbox job by ID; it did not invoke the global payments worker. This settled an existing owed test-mode payout. No live funds moved. The script requires explicit opt-in and must not be repeated merely to reproduce evidence, because it can select another eligible test-mode payout.

This resolves the specific wrong-workspace resale credit and demonstrates one real original-method seller refund. It does not certify all historical payouts, primary cancellation liability reversals, resale chains, chargebacks, webhook delivery or live payment configuration. Those remain release gates. The PWA's design comparisons and complete route/state checks also remain independent gates; this financial evidence does not mark any screen complete.
