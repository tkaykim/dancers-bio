"use server";
import { revalidatePath } from "next/cache";
import { requireStaff,canManageProject,isSuperAdmin } from "@/lib/auth/guard";
import { checked, db } from "@/lib/campaign/repository";
import { submissionError } from "@/lib/campaign/submissions";
import type { ActionResult } from "@/lib/campaign/types";
export async function saveBudgetAction(project: string,action:"configure"|"fee",input:Record<string,unknown>):Promise<ActionResult<null>> {
  const profile=await requireStaff();
  try {
    if (!/^[0-9a-f-]{36}$/i.test(project) || !["configure","fee"].includes(action) || !input || JSON.stringify(input).length>10000) throw new Error("CAMPAIGN_DENIED");
    if(!await canManageProject(project)||(action==="configure"&&!isSuperAdmin(profile)))throw new Error("CAMPAIGN_DENIED");
    const allowed=action==="configure" ? ["version","total_amount","operations_reserve","basis"] : ["participant_id","version","amount","status","note"];
    const data=Object.fromEntries(Object.entries(input).filter(([key])=>allowed.includes(key)));
    for(const key of ["amount","total_amount","operations_reserve"]) {
      if(data[key]!==undefined && data[key]!==null && (!Number.isSafeInteger(data[key]) || Number(data[key])<0 || Number(data[key])>1e12)) throw new Error("BUDGET_AMOUNT");
    }
    checked(await db().rpc("campaign_budget_mutate",{p_project:project,p_actor:profile.id,p_action:action,p_data:data}));
    revalidatePath(`/tools/campaigns/${project}`);
    return {ok:true,data:null};
  } catch(e) {
    const message=e instanceof Error ? e.message : "";
    return {ok:false,error:message==="BUDGET_BASIS_REQUIRED" ? "확인 근거 또는 변경 사유를 입력해 주세요." : message==="BUDGET_AMOUNT" ? "금액은 0 이상의 정수로 입력해 주세요." : submissionError(e)};
  }
}
