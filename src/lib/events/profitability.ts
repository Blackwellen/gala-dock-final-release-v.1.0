// Gala Dock — Event profitability engine (EB-C). Pure, deterministic calculators used by the
// budget/profitability tabs, proposals, scenarios and settlement. All money in pence.

export interface MoneyLine {
  category: string;
  amountCents: number;
  confirmed?: boolean;
}

/** A split of the event profit — percentage of profit and/or a fixed amount. */
export interface ProfitSplit {
  name: string;
  pct?: number; // % of profit-before-split
  fixedCents?: number;
}

export interface SplitPayout {
  name: string;
  amountCents: number;
}

export interface Profitability {
  estRevenueCents: number;
  confirmedRevenueCents: number;
  estCostCents: number;
  confirmedCostCents: number;
  /** Profit before splits = est revenue − est cost. */
  profitBeforeSplitCents: number;
  marginPct: number;
  breakEvenRevenueCents: number;
  /** null when no average ticket price provided. */
  breakEvenTickets: number | null;
  splitPayouts: SplitPayout[];
  profitAfterSplitCents: number;
}

function sum(lines: MoneyLine[], onlyConfirmed = false): number {
  return lines.filter((l) => !onlyConfirmed || l.confirmed).reduce((a, l) => a + (l.amountCents || 0), 0);
}

export function computeProfitability(input: {
  budget: MoneyLine[];
  revenue: MoneyLine[];
  splits?: ProfitSplit[];
  avgTicketPriceCents?: number;
}): Profitability {
  const estRevenue = sum(input.revenue);
  const confirmedRevenue = sum(input.revenue, true);
  const estCost = sum(input.budget);
  const confirmedCost = sum(input.budget, true);
  const profitBeforeSplit = estRevenue - estCost;
  const marginPct = estRevenue > 0 ? profitBeforeSplit / estRevenue : 0;
  const avg = input.avgTicketPriceCents ?? 0;
  const breakEvenTickets = avg > 0 ? Math.ceil(estCost / avg) : null;

  const splits = input.splits ?? [];
  const splitPayouts: SplitPayout[] = splits.map((s) => ({
    name: s.name,
    amountCents: Math.max(
      0,
      Math.round((s.fixedCents ?? 0) + (profitBeforeSplit > 0 ? profitBeforeSplit * ((s.pct ?? 0) / 100) : 0))
    ),
  }));
  const totalSplit = splitPayouts.reduce((a, p) => a + p.amountCents, 0);

  return {
    estRevenueCents: estRevenue,
    confirmedRevenueCents: confirmedRevenue,
    estCostCents: estCost,
    confirmedCostCents: confirmedCost,
    profitBeforeSplitCents: profitBeforeSplit,
    marginPct,
    breakEvenRevenueCents: estCost,
    breakEvenTickets,
    splitPayouts,
    profitAfterSplitCents: profitBeforeSplit - totalSplit,
  };
}

// ── Scenario projections ─────────────────────────────────────────────────
export const SCENARIO_SELLTHROUGH = { conservative: 0.5, expected: 0.75, aggressive: 0.95 } as const;
export type ScenarioName = keyof typeof SCENARIO_SELLTHROUGH;

export interface ScenarioProjection {
  name: ScenarioName;
  sellThrough: number;
  ticketsSold: number;
  revenueCents: number;
}

export function projectRevenueByCapacity(avgTicketPriceCents: number, capacity: number, sellThrough: number): number {
  const st = Math.max(0, Math.min(1, sellThrough));
  return Math.round(avgTicketPriceCents * capacity * st);
}

export function scenarioProjections(avgTicketPriceCents: number, capacity: number): ScenarioProjection[] {
  return (Object.entries(SCENARIO_SELLTHROUGH) as [ScenarioName, number][]).map(([name, st]) => ({
    name,
    sellThrough: st,
    ticketsSold: Math.round(capacity * st),
    revenueCents: projectRevenueByCapacity(avgTicketPriceCents, capacity, st),
  }));
}
