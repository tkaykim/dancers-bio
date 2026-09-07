import type { Participant } from "./submissions";
export type BudgetSettings = { project_id: string; total_amount: number | null; operations_reserve: number | null; basis: string; version: number };
export type BudgetFee = { participant_id: string; amount: number | null; status: "estimate" | "agreed"; note: string; version: number };
export type BudgetSettlement = { id: string; dancer_id: string; gross_amount: number | null; vat_amount: number | null; role: string; status: string };
export type BudgetQuote = { id: string; proposed_fee: number | null; proposed_fee_currency: string | null; proposed_fee_unit: string | null };
export type BudgetData = { canViewFinance?: boolean; settings: BudgetSettings; participants: Participant[]; fees: BudgetFee[]; settlements: BudgetSettlement[]; quotes: BudgetQuote[]; expense: number | null };
export function budgetSummary(data: BudgetData) {
  const settlements = data.settlements.filter(s => s.status !== "cancelled");
  const cost = (s: BudgetSettlement) => Number(s.gross_amount ?? 0) + Number(s.vat_amount ?? 0);
  const assigned = new Set<string>();
  const rows = data.participants.filter(p => p.active).map(p => {
    const fee = data.fees.find(f => f.participant_id === p.id);
    const records = settlements.filter(s => p.dancer_id && s.dancer_id === p.dancer_id && s.role === "dancer");
    records.forEach(s => assigned.add(s.id));
    const registered = records.some(s => s.gross_amount !== null) ? records.reduce((sum, s) => sum + cost(s), 0) : null;
    const planned = fee?.amount == null ? null : Number(fee.amount);
    // The plan and settlement can describe the same fee: reserve the greater value, never add both.
    const required = registered === null && planned === null ? null : Math.max(registered ?? 0, planned ?? 0);
    return { participant: p, fee, quote: data.quotes.find(q => q.id === p.application_id), registered, required };
  });
  const outside = settlements.filter(s => !assigned.has(s.id));
  const otherRegistered = outside.reduce((sum, s) => sum + cost(s), 0);
  const operations = data.settings.operations_reserve === null && data.expense === null ? null : Math.max(Number(data.settings.operations_reserve ?? 0), Number(data.expense ?? 0));
  const knownRequired = rows.reduce((sum, row) => sum + (row.required ?? 0), 0) + otherRegistered + (operations ?? 0);
  const unpriced = rows.filter(r => r.required === null).length;
  return {
    rows, unpriced, operations, knownRequired, otherRegistered,
    unsettledAmounts: settlements.filter(s => s.gross_amount === null).length,
    outsideCount: outside.length,
    registeredTotal: settlements.reduce((sum, s) => sum + cost(s), 0),
    agreedTotal: rows.reduce((sum,r) => sum + (r.fee?.status === "agreed" ? Number(r.fee.amount ?? 0) : 0),0),
    agreedCount: rows.filter(r => r.fee?.status === "agreed" && r.fee.amount !== null).length,
    remaining: data.settings.total_amount === null ? null : Number(data.settings.total_amount) - knownRequired,
    complete: unpriced === 0 && operations !== null && settlements.every(s => s.gross_amount !== null),
  };
}
