import test from "node:test";
import assert from "node:assert/strict";
import { budgetSummary,type BudgetData } from "./budget";
import { loadModule } from "./test-loader";
import type { Participant } from "./submissions";
const person={id:"p",dancer_id:"d",application_id:"a",display_name:"참여자",active:true} as Participant;
const base:BudgetData={settings:{project_id:"project",total_amount:1000000,operations_reserve:null,basis:"확인 근거",version:1},participants:[person],fees:[],settlements:[],quotes:[{id:"a",proposed_fee:50000,proposed_fee_currency:"KRW",proposed_fee_unit:"회당"}],expense:null};
test("budget never treats requested fees or unknown costs as confirmed spending",()=>{
  const s=budgetSummary(base);
  assert.equal(s.knownRequired,0); assert.equal(s.unpriced,1); assert.equal(s.complete,false); assert.equal(s.rows[0].required,null);
  assert.equal(budgetSummary({...base,settings:{...base.settings,total_amount:null}}).remaining,null);
});
test("budget reserves the larger plan/settlement once, includes outside costs and excludes cancelled",()=>{
  const s=budgetSummary({...base,settings:{...base.settings,operations_reserve:200000},expense:100000,
    fees:[{participant_id:"p",amount:100000,status:"agreed",note:"확인",version:1}],
    settlements:[{id:"s",dancer_id:"d",gross_amount:150000,vat_amount:15000,role:"dancer",status:"pending"},{id:"other",dancer_id:"other",gross_amount:50000,vat_amount:0,role:"dancer",status:"pending"},{id:"cancel",dancer_id:"d",gross_amount:900000,vat_amount:0,role:"dancer",status:"cancelled"}]});
  assert.equal(s.knownRequired,415000);assert.equal(s.remaining,585000);assert.equal(s.agreedTotal,100000);assert.equal(s.registeredTotal,215000);assert.equal(s.outsideCount,1);assert.equal(s.complete,true);
});
test("zero fee is a known free agreement and inactive people do not reserve planned money",()=>{
  const s=budgetSummary({...base,settings:{...base.settings,operations_reserve:0},fees:[{participant_id:"p",amount:0,status:"agreed",note:"무료 합의",version:1}]});
  assert.equal(s.unpriced,0);assert.equal(s.complete,true);
  assert.equal(budgetSummary({...base,participants:[{...person,active:false}],fees:[{participant_id:"p",amount:50000,status:"agreed",note:"이탈",version:1}]}).agreedTotal,0);
});
test("budget reads and writes require super admin before touching the service database",async()=>{
  let touched=false;
  const mocks={"@/lib/auth/guard":{async requireSuperAdmin(){throw new Error("denied");}},"@/lib/campaign/repository":{db(){touched=true;}},"./repository":{},"./submission-repository":{},"@/lib/campaign/submissions":{},"next/cache":{}};
  const read=loadModule<typeof import("./budget-repository")>("src/lib/campaign/budget-repository.ts",mocks);
  const write=loadModule<typeof import("../../app/actions/campaign-budget")>("src/app/actions/campaign-budget.ts",mocks);
  await assert.rejects(read.loadBudget("project"),/denied/);await assert.rejects(write.saveBudgetAction("project","fee",{}),/denied/);assert.equal(touched,false);
});
