# VAT: decisions needed (release spec §138)

**Status: needs a UK VAT adviser.** This note isn't tax advice. It lists the questions the adviser has to answer and what the platform already does, so the advice can be applied quickly.

## What the platform does today
- Gala Dock fees are shown and charged **excluding VAT**:
  - supplier commission 8/7/6% by plan
  - 2.5% customer admin fee
  - ticket fee of £1 + 5%
  - boosts and subscriptions
- Providers' own prices are whatever they enter. A provider can add VAT to a quote line (`tax_bps` on quotes).
- Marketplace payments are taken by Gala Dock as the **provider's commercial agent** (see the Payment Protection Terms), then released after delivery.
- Blackwellen Limited's VAT number field exists in Settings → Workspace.

## Questions for the adviser
1. **VAT registration: done.** Blackwellen Limited is VAT-registered (**GB508480488**, added 12 Oct 2026). Gala Dock's own fees are UK supplies, so standard-rated 20% VAT applies to them unless the adviser says otherwise: ticket fees, seller commission, booking admin fee, supplier commission, subscriptions and boosts. **This is now urgent:** prices are currently shown and charged excluding VAT.
2. **Agent or principal for bookings:** the terms set Gala Dock up as an agent, so only the commission is Gala Dock's supply. Does the adviser agree? Does the 2.5% customer admin fee count as a separate supply to the customer?
3. **Tickets:** when an organiser sells tickets through Gala Dock, is Gala Dock an agent (VAT due only on the £1 + 5% fee) or a principal (VAT due on the whole ticket price)? This depends on who the ticket buyer contracts with.
4. **Platform rules for overseas sellers:** do any providers or organisers sit outside the UK? If so, check the online marketplace rules (joint and several liability, and VAT on goods).
5. **Invoices:** what has to appear on VAT invoices for fees (VAT number, rate, net/VAT/gross)? Do we issue self-billed invoices for provider commission?
6. **Prices to consumers:** should fees shown to consumers be VAT-inclusive? Consumer prices must show the full price.

## What changes once decided (about a day's work)
- Add the VAT rate and number to `fee_schedule`. Charge VAT on Gala Dock fees and show it as a separate line at checkout and on receipts.
- Show fees VAT-inclusive to consumers.
- Put VAT on fee invoices and monthly provider statements (number, rate, net/VAT/gross).
- Add VAT summary columns to the CSV export for the accountant.
