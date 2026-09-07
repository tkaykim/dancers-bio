"use server";
import {requireUser,canManageProject} from "@/lib/auth/guard";
import {db,checked} from "@/lib/campaign/repository";
import {submissionError} from "@/lib/campaign/submissions";
import {normalizeInstagramHandle} from "@/lib/instagram/handle";
import {revalidatePath} from "next/cache";
export async function saveManualParticipant(project:string,input:Record<string,unknown>){
  const user=await requireUser();
  try{
    if(!/^[0-9a-f-]{36}$/i.test(project)||!await canManageProject(project)||!input||JSON.stringify(input).length>10000)throw new Error("CAMPAIGN_DENIED");
    const allowed=["request_id","participant_id","version","dancer_id","display_name","ig_handle","owner_label","note","client_visible"];
    const data=Object.fromEntries(Object.entries(input).filter(([k])=>allowed.includes(k)));
    const raw=typeof data.ig_handle==="string"?data.ig_handle.trim():"";
    data.ig_handle=raw?normalizeInstagramHandle(raw):null;
    if(raw&&!data.ig_handle)throw new Error("CAMPAIGN_INVALID_URL");
    const result=checked(await db().rpc("campaign_manual_participant",{p_project:project,p_actor:user.id,p_data:data}));
    revalidatePath(`/tools/campaigns/${project}`);revalidatePath(`/campaigns/${project}/submit`);revalidatePath("/applications");revalidatePath("/cast/[code]","page");
    return {ok:true as const,data:result};
  }catch(e){return {ok:false as const,error:submissionError(e)};}
}
export async function searchCampaignProfiles(project:string,query:string){
  await requireUser();
  if(!await canManageProject(project))throw new Error("권한이 없습니다.");
  const q=query.trim().replace(/[%_,()]/g,"").slice(0,60);if(q.length<2)return [];
  const data=checked(await db().from("dancers").select("id,stage_name,social_links,profile_id").ilike("stage_name",`%${q}%`).limit(20));
  return (data??[]).map(p=>({id:p.id,name:p.stage_name,instagram:p.social_links?.instagram??null,hasAccount:!!p.profile_id}));
}
