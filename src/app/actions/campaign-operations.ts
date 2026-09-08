"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff,canManageProject,isSuperAdmin } from "@/lib/auth/guard";
import { checked,db } from "@/lib/campaign/repository";
import { operationSchema,termsSchema,policySchema } from "@/lib/campaign/operations";
import { submissionError } from "@/lib/campaign/submissions";
const feeSchema=z.object({version:z.number().int().min(0),status:z.enum(["estimate","agreed"]),note:z.string().trim().min(1).max(2000),terms:termsSchema});
const personSchema=z.object({participant_id:z.uuid(),participant_version:z.number().int().min(1),version:z.number().int().min(0),fields:operationSchema,fee:feeSchema.nullable()});
export async function saveCampaignOperations(project:string,action:"participant"|"settings",input:unknown){
 const user=await requireStaff();
 try{
   if(!z.uuid().safeParse(project).success||!await canManageProject(project))throw new Error("CAMPAIGN_DENIED");
   if(action==="settings"&&!isSuperAdmin(user))throw new Error("CAMPAIGN_DENIED");
   if(!["participant","settings"].includes(action))throw new Error("CAMPAIGN_DENIED");
   const parsed=action==="participant"?personSchema.safeParse(input):z.object({version:z.number().int().min(0),fields:policySchema}).safeParse(input);
   if(!parsed.success)return {ok:false as const,error:parsed.error.issues[0]?.message??"입력 내용을 확인해 주세요."};
   checked(await db().rpc("campaign_operations_mutate",{p_project:project,p_actor:user.id,p_action:action,p_data:parsed.data}));
   revalidatePath(`/tools/campaigns/${project}`);revalidatePath(`/campaigns/${project}/submit`);revalidatePath("/cast/[code]","page");
   return {ok:true as const,data:null};
 }catch(e){return {ok:false as const,error:submissionError(e)};}
}
