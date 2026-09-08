import { z } from "zod";
import { currentSubmissions, usableApproval, type Participant, type SubmissionData } from "./submissions";
import { budgetSummary, type BudgetData, type BudgetFee } from "./budget";
const money=z.number().int().min(0).max(1e12).nullable();
export const accountSchema=z.object({handle:z.string().regex(/^[a-z0-9._]{1,30}$/),count:z.number().int().min(1).max(10),guide_amount:money,agreed_amount:money});
export const operationSchema=z.object({
 engagement:z.enum(["confirmed","negotiating","on_hold","cancelled"]),
 planned_on:z.iso.date().nullable(),schedule_kind:z.enum(["participation","upload"]),
 owner_label:z.string().max(100),upload_reported:z.boolean(),next_action:z.string().max(300),
 note:z.string().max(6000),accounts:z.array(accountSchema).max(10),
}).refine(x=>new Set(x.accounts.map(a=>a.handle)).size===x.accounts.length,"계정이 중복됩니다.");
export const termsSchema=z.object({
 guide_amount:money,quote_amount:money,offer_amount:money,base_amount:money,bonus_amount:money,threshold:money,
 condition_state:z.enum(["unmeasured","below","met"]),condition_note:z.string().max(2000),
}).refine(x=>!x.bonus_amount||!!x.threshold,"성과 기준을 입력해 주세요.");
export const policySchema=z.object({
 spend_target:money,spend_cap:money,notes:z.string().max(12000),payout_note:z.string().max(1000),retention_note:z.string().max(1000),
}).refine(x=>x.spend_target===null||x.spend_cap===null||x.spend_target<=x.spend_cap,"목표액은 상한 이하여야 합니다.");
export type Operation=z.infer<typeof operationSchema>;
export type FeeTerms=z.infer<typeof termsSchema>;
export type OperationsRow={participant_id:string;data:Operation;version:number};
export type OperationsPolicy={data:Partial<z.infer<typeof policySchema>>;version:number};
export const emptyTerms:FeeTerms={guide_amount:null,quote_amount:null,offer_amount:null,base_amount:null,bonus_amount:null,threshold:null,condition_state:"unmeasured",condition_note:""};
export function termsFor(fee?:BudgetFee):FeeTerms {
 return {...emptyTerms,base_amount:fee?.amount??null,...fee?.terms};
}
export function operationFor(person:Participant,rows:OperationsRow[]):Operation {
 return rows.find(r=>r.participant_id===person.id)?.data??{
 engagement:person.active?"confirmed":"cancelled",planned_on:null,schedule_kind:"upload",owner_label:person.owner_label,
 upload_reported:false,next_action:"",note:"",accounts:person.ig_handle?[{handle:person.ig_handle,count:1,guide_amount:null,agreed_amount:null}]:[],
 };
}
export const engagementLabels={confirmed:"참여 확정",negotiating:"협의 중",on_hold:"보류",cancelled:"취소"};
export function operationState(person:Participant,ops:Operation,data:SubmissionData){
 if(ops.engagement==="cancelled"||!person.active)return "cancelled";
 if(ops.engagement==="on_hold")return "on_hold";
 if(ops.engagement==="negotiating")return "negotiating";
 const subs=currentSubmissions(data,person.id);
 const expected=Math.max(1,ops.accounts.reduce((s,a)=>s+a.count,0));
 const approved=new Set(subs.filter(s=>usableApproval(s,data)).map(s=>s.post_id)).size;
 if(approved>=expected)return "approved";
 if(subs.some(s=>s.status==="changes_requested"))return "changes_requested";
 if(subs.length)return "review";
 if(ops.upload_reported)return "link_needed";
 return ops.planned_on?"scheduled":"unscheduled";
}
export const operationLabels:Record<string,string>={approved:"승인 완료",review:"제출 검토",changes_requested:"수정 요청",link_needed:"링크 확인",scheduled:"참여 예정",unscheduled:"일정 확인",negotiating:"협의 중",on_hold:"보류",cancelled:"취소"};
export function operationsSummary(budget:BudgetData,rows:OperationsRow[],data:SubmissionData){
 const included=budget.participants.filter(p=>p.active&&!["cancelled","on_hold"].includes(operationFor(p,rows).engagement));
 const summary=budgetSummary({...budget,participants:included});
 let agreed=0,estimate=0,conditional=0,offered=0;
 for(const p of included){
   const f=budget.fees.find(x=>x.participant_id===p.id),t=termsFor(f);
   if(operationFor(p,rows).engagement==="negotiating"){offered+=Number(f?.amount??0);continue;}
   conditional+=Number(t.bonus_amount??0);
   if(f?.status==="agreed")agreed+=Number(t.base_amount??0);else estimate+=Number(t.base_amount??0);
 }
 return {...summary,agreed,estimate,conditional,offered,uniquePosts:new Set(data.submissions.filter(s=>!s.replaced_at&&included.some(p=>p.id===s.participant_id)).map(s=>s.post_id)).size};
}
