import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('./quick-apply.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

function fixture({autoAccept=false, existing=null, duplicate=false, expired=false}={}) {
  const writes=[];
  let mails=0;
  let users=0;
  const project={id:'project',short_code:'party',title:'Party',status:'open',visibility:'public',recruitment_unlimited:true,auto_accept_on_apply:autoAccept,application_deadline:expired?'2000-01-01T00:00:00Z':null};
  const admin={auth:{admin:{createUser:async()=>{users++;return {data:{user:{id:'user'}}};}}},from(table){
    let operation='select';let payload;const filters={};
    const result=()=>{
      if(operation!=='select')writes.push({table,operation,payload});
      if(table==='projects')return {data:project};
      if(table==='dancers')return {data:{id:'dancer',social_links:{}}};
      if(table==='applications')return {data:operation==='insert'?{id:'app'}:existing};
      if(table==='project_submissions')return {data:filters.application_id?{token:'token'}:duplicate?{token:'token',application_id:'app'}:null};
      return {data:null,error:null};
    };
    const q={select(){return q;},eq(k,v){filters[k]=v;return q;},ilike(k,v){filters[k]=v;return q;},is(){return q;},not(){return q;},insert(v){operation='insert';payload=v;return q;},update(v){operation='update';payload=v;return q;},upsert(v){operation='upsert';payload=v;return q;},maybeSingle:async()=>result(),single:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};
    return q;
  }};
  const module={exports:{}};
  const mocks={
    '@/lib/supabase/admin':{createAdminClient:()=>admin},
    '@/lib/alimtalk/solapi':{normalizePhone:()=>'+821012345678'},
    '@/lib/notify/challenge-guideline-mail':{sendChallengeGuidelineMail:async()=>{mails++;return {ok:true};}},
    '@/lib/i18n/locale':{resolveLocale:()=> 'ko'},
    '@/lib/i18n/server':{acceptLanguage:async()=> 'ko'},
    '@/lib/i18n/messages':{t:(_locale,key)=>key,isMessageKey:()=>true},
  };
  const wrapper=vm.runInNewContext('(function(require,module,exports,process){'+compiled+'\n})',{Date,console});
  wrapper(id=>mocks[id]??require(id),module,module.exports,{env:{NEXT_PUBLIC_SITE_URL:'https://example.test'}});
  const form=new FormData();
  for(const [key,value] of Object.entries({name:'Test applicant',email:'test@example.com',phone:'01012345678',instagram:'test_handle'}))form.set(key,value);
  return {run:()=>module.exports.quickApplyAction('party',form),writes,mails:()=>mails,users:()=>users};
}

test('manual review creates a pending application and no campaign submission or mail',async()=>{
  const f=fixture();const result=await f.run();
  assert.equal(result.state,'review');assert.equal(result.submitUrl,null);
  const inserted=f.writes.find(w=>w.table==='applications');
  assert.equal(inserted.payload.status,'pending');assert.equal(inserted.payload.responded_at,null);
  assert.equal(f.writes.some(w=>w.table==='project_submissions'),false);assert.equal(f.mails(),0);
});
test('only explicit auto-accept retains campaign acceptance and upload result',async()=>{
  const f=fixture({autoAccept:true});const result=await f.run();
  assert.equal(f.writes.find(w=>w.table==='applications').payload.status,'accepted');
  assert.equal(result.submitUrl,'https://example.test/submit/token');assert.equal(f.mails(),1);
});
for(const status of ['pending','rejected','accepted']){
  test('manual repeat preserves the existing '+status+' decision',async()=>{
    const f=fixture({existing:{id:'app',status}});const result=await f.run();
    assert.equal(result.state,'review');assert.equal(f.writes.some(w=>w.table==='applications'),false);assert.equal(f.mails(),0);
  });
}
test('legacy submission token cannot promote a manual applicant on repeat',async()=>{
  const f=fixture({duplicate:true,existing:{id:'app',status:'pending',archived_at:null}});
  const result=await f.run();assert.equal(result.state,'review');assert.equal(result.submitUrl,null);assert.equal(f.writes.length,0);assert.equal(f.users(),0);
});
test('manual-review applications still enforce the deadline before creating an account',async()=>{
  const f=fixture({expired:true});const result=await f.run();
  assert.equal(result.ok,false);assert.equal(result.error,'apply.error.deadline_passed');assert.equal(f.users(),0);assert.equal(f.writes.length,0);
});
