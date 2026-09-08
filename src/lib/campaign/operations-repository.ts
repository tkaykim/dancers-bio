import "server-only";
import { requireStaff,canManageProject,isSuperAdmin } from "@/lib/auth/guard";
import { checked,db,rows } from "./repository";
import type { OperationsRow,OperationsPolicy } from "./operations";
export async function loadOperations(project:string){
 const profile=await requireStaff();
 if(!await canManageProject(project))throw new Error("권한이 없습니다.");
 const [people,result]=await Promise.all([
 rows<OperationsRow>("campaign_participant_operations","participant_id,data,version",project),
 db().from("campaign_operations_settings").select("data,version").eq("project_id",project).maybeSingle(),
 ]);
 const settings:OperationsPolicy=checked(result)??{data:{},version:0};
 if(!isSuperAdmin(profile))settings.data={notes:settings.data.notes,payout_note:settings.data.payout_note,retention_note:settings.data.retention_note};
 return {people,settings};
}
