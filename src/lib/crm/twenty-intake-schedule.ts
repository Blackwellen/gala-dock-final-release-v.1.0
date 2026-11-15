import { after } from "next/server";
import { forwardLeadToTwenty, isTwentyIntakeEnabled, type TwentyLead } from "./twenty-intake";

/**
 * Hands a lead to Twenty AFTER the response has been sent (Next.js `after`), so the form never waits on the CRM.
 * Off unless TWENTY_INTAKE_ENABLED=true. Never throws, and `forwardLeadToTwenty` never rejects.
 */
export function scheduleTwentyLead(lead: TwentyLead): void {
  if (!isTwentyIntakeEnabled()) return;
  try {
    after(() => forwardLeadToTwenty(lead));
  } catch {
    // Outside a request scope: run it detached rather than lose the lead.
    void forwardLeadToTwenty(lead);
  }
}
