import {test} from "node:test";
import assert from "node:assert/strict";
import {operationFor,operationState,operationSchema,termsSchema} from "./operations";
import type {Participant,SubmissionData} from "./submissions";
import {loadModule} from "./test-loader";
const person={id:"p",active:true,ig_handle:"one",owner_label:""} as Participant;
const data={participants:[person],posts:[{id:"post",status:"active"}],submissions:[{id:"s1",participant_id:"p",post_id:"post",status:"approved",replaced_at:null},{id:"s2",participant_id:"p",post_id:"post",status:"approved",replaced_at:null}]} as SubmissionData;
test("a collaborative link cannot fulfill two deliverables",()=>{
 const o=operationFor(person,[]);o.accounts.push({handle:"two",count:1,guide_amount:null,agreed_amount:null});
 assert.equal(operationState(person,o,data),"review");
 assert.equal(operationState(person,{...o,engagement:"on_hold"},data),"on_hold");
});
test("a reported upload without a link remains an action item",()=>{
 const o=operationFor(person,[]);o.upload_reported=true;
 assert.equal(operationState(person,o,{...data,submissions:[]}),"link_needed");
 assert.equal(operationSchema.safeParse({...o,accounts:[...o.accounts,...o.accounts]}).success,false);
 assert.equal(termsSchema.safeParse({base_amount:0,bonus_amount:50000,threshold:null,guide_amount:null,quote_amount:null,offer_amount:null,condition_state:"unmeasured",condition_note:""}).success,false);
});
test("managers receive operational policy without campaign financial limits",async()=>{
 const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{version:1,data:{spend_target:7000000,spend_cap:8000000,notes:"운영 기준",payout_note:"미정"}}})};
 const repository=loadModule<typeof import("./operations-repository")>("src/lib/campaign/operations-repository.ts",{
  "@/lib/auth/guard":{requireStaff:async()=>({id:"manager"}),canManageProject:async()=>true,isSuperAdmin:()=>false},
  "./repository":{checked:(r:{data:unknown})=>r.data,rows:async()=>[],db:()=>({from:()=>query})},
 });
 const result=await repository.loadOperations("project");
 assert.equal(result.settings.data.notes,"운영 기준");
 assert.equal(Object.hasOwn(result.settings.data,"spend_cap"),false);
 assert.equal(Object.hasOwn(result.settings.data,"spend_target"),false);
});
