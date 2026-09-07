import "server-only";
import { requireSuperAdmin } from "@/lib/auth/guard";
import { checked, db, rows } from "./repository";
import { loadSubmissions } from "./submission-repository";
import type { BudgetData, BudgetFee, BudgetQuote, BudgetSettlement, BudgetSettings } from "./budget";
export async function loadBudget(project: string): Promise<BudgetData> {
  await requireSuperAdmin();
  const config = await db().from("campaign_budget_settings").select("project_id,total_amount,operations_reserve,basis,version").eq("project_id",project).maybeSingle();
  if (config.error && !["42P01","PGRST205"].includes(config.error.code)) checked(config);
  const settings: BudgetSettings = config.data ?? { project_id:project,total_amount:null,operations_reserve:null,basis:"",version:0 };
  const [submissions, fees, settlements, quotes, expense] = await Promise.all([
    loadSubmissions(project),
    settings.version ? rows<BudgetFee>("campaign_budget_fees","participant_id,amount,status,note,version",project) : [],
    rows<BudgetSettlement>("settlements","id,dancer_id,gross_amount,vat_amount,role,status",project),
    rows<BudgetQuote>("applications","id,proposed_fee,proposed_fee_currency,proposed_fee_unit",project),
    db().from("project_finances").select("expense_amount").eq("project_id",project).maybeSingle(),
  ]);
  return { settings,participants:submissions.participants,fees,settlements,quotes,expense:checked(expense)?.expense_amount ?? null };
}
