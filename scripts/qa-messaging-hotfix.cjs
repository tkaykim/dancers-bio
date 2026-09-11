// Isolated browser QA of the actual React components; no customer data or external sends.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { chromium, webkit } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = process.env.QA_OUTPUT_DIR || path.resolve(root, '../../deliverables/deetz-messaging-hotfix-20260910');
fs.mkdirSync(out, { recursive: true });
const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatRoomView } from '@/components/messaging/ChatRoomView';
import { MessageDancerButton } from '@/components/messaging/MessageDancerButton';
import { ApplicantPortfolioSheet } from '@/components/project/ApplicantPortfolioSheet';
import { MessageViewport } from '@/components/messaging/MessageViewport';
import { StaffInbox } from '@/components/messaging/StaffInbox';
import { ApplicantsConsole } from '@/components/project/ApplicantsConsole';
import { ApplicantsPageHeader } from '@/components/project/ApplicantsPageHeader';
import { ApplicantOperations } from '@/components/project/ApplicantOperations';
import { WithdrawalLinkPanel } from '@/components/project/WithdrawalLinkPanel';
import { BankPicker } from '@/components/settlement/BankPicker';
import { ReviewProfileSheet } from '@/components/casting/ReviewProfileSheet';
import { RateCardManager } from '@/components/portfolio/RateCardManager';
import { CareerHistoryManager } from '@/components/portfolio/CareerHistoryManager';
import { RejectReasonDialog } from '@/components/project/RejectReasonDialog';
import { ProfilePreviewSheet } from '@/app/ops/ndol-20260618/[token]/OpsBoardClient';
const qa = window.qa = { sends: [], mutations:[], failed: false, interleave: false, offline: false, room:'room-1', messages: [] };
const room = { id: 'room-1', lastSeq: 1, staffLastReadSeq: 0, memberReadSeq: 0, closed: false, resolved: false, awaitingSince: null };
const message = (seq,body,role='member') => ({ id:'m'+seq, room_seq:seq, sender_role:role, kind:'text', body, action:null, deleted_at:null, created_at:new Date().toISOString() });
qa.messages = [message(1,'안녕하세요. 프로젝트 일정과 참여 조건을 확인하고 싶습니다. https://example.com/'+ 'longpath'.repeat(35))];
qa.message = message;
window.fetch = async (url) => {
  if(qa.offline) throw new Error('offline');
  if(String(url).includes('staff-rooms')) return new Response(JSON.stringify({ rooms:[{roomId:'room-1',dancerId:'dancer',dancerName:'아주 긴 활동명을 가진 지원자',staffUnread:1,lastSeq:1,awaitingSince:null,lastPreview:'안녕하세요',lastMessageAt:new Date().toISOString()}]}));
  const after = Number(new URL(url,location.origin).searchParams.get('after_seq')||0);
  return new Response(JSON.stringify({room:{...room,lastSeq:qa.messages.length}, messages:qa.messages.filter(m=>m.room_seq>after),responses:[],notes:[]}));
};
qa.action = async (name,input) => {
  if(input instanceof FormData)qa.mutations.push({name,values:Object.fromEntries(input)});
  if(name==='getCastingReviewProfileAction') return {ok:true,data:{name:'한국어 이름과 LongEnglishNameForMobileLayout',koreanName:'지원자',genres:['힙합','코레오그래피'],specialties:['공연'],location:'대한민국 서울',socialLinks:{instagram:'testprofile'},careers:[],bio:'긴 한국어 문장이 좁은 화면에서도 읽기 좋게 나오는지 확인합니다.'}};
  if(name==='openDancerThreadAction') { qa.openInput=input; return {ok:true,data:{roomId:'room-1'}}; }
  if(name==='getApplicantPortfolioAction') return {ok:true,data:{dancer:{id:'22222222-2222-4222-8222-222222222222',stage_name:'지원자',genres:[],specialties:[],social_links:{instagram:'test'},portfolio_file_url:'https://example.com/portfolio.pdf',portfolio_file_name:'긴한국어제목과LongEnglishPortfolioFileName.pdf'},careers:[],settlement:null}};
  if(name==='getMyEvaluationAction') return {ok:true,data:null};
  if(name==='sendStaffMessageAction'||name==='sendDancerMessageAction') {
    qa.sends.push(input);
    await new Promise(r=>setTimeout(r,120));
    if(qa.failed) throw new Error('연결이 끊겼습니다.');
    if(qa.interleave) { qa.messages.push(message(qa.messages.length+1,'동시에 도착한 상대 메시지')); qa.interleave=false; }
    const existing=qa.messages.find(m=>m.client_message_id===input.clientMessageId);
    const m=existing||{...message(qa.messages.length+1,input.body,name==='sendStaffMessageAction'?'team':'member'),client_message_id:input.clientMessageId};
    if(!existing)qa.messages.push(m);
    return {ok:true,data:{id:m.id,roomSeq:m.room_seq,createdAt:m.created_at}};
  }
  return {ok:true,data:null};
};
const pid='11111111-1111-4111-8111-111111111111';
const did='22222222-2222-4222-8222-222222222222';
const mode=new URLSearchParams(location.search).get('mode');
const role=new URLSearchParams(location.search).get('role')||'staff';
const projects=[{id:pid,title:'긴 프로젝트 제목과 촬영 일정을 함께 확인하는 프로젝트'},{id:'44444444-4444-4444-8444-444444444444',title:'다른 프로젝트'}];
const applicants=Array.from({length:4},(_,i)=>({id:'application-'+i,status:i===3?'accepted':'pending',source:'apply',cover_message:'지원 동기와 활동 경력을 확인할 수 있는 긴 한국어 문장입니다.',created_at:new Date(2026,8,10-i).toISOString(),isTeam:false,name:i===0?'한국어 이름과 LongEnglishDancerNameForMobileReview':'지원자 '+i,korean_name:null,avatar:null,publicHref:'/d/test',dancerId:did,gender:'female',heightCm:170,genres:['힙합','코레오그래피'],location:'대한민국 서울',rejection_reason:null,recruitmentChannelId:'channel',recruitmentChannelName:'해외 댄서 공동 모집 채널',proposed_fee:400000,proposed_fee_currency:'KRW',proposed_fee_unit:'촬영 1회',fee_status:'negotiable',castingDetails:null,confirmedAt:null,passedRound:i===3?1:0,noticeSent:true,evalCount:2,avgScore:8,myScore:null}));
createRoot(document.getElementById('root')).render(
 mode==='console' ? <main className="mx-auto max-w-3xl px-4 py-4"><div className="mb-5"><ApplicantsPageHeader title="해외 댄서와 함께하는 아주 긴 프로젝트 이름" projectId={pid} projectCode="qa" messagingEnabled={true}/></div><ApplicantsConsole projectId={pid} recruitmentCount={2} selectionRounds={4} roundLabels={['서류 심사 합격','영상 오디션 합격','대면 오디션 합격','최종 선발 확정']} initial={applicants} channels={[{id:'channel',name:'해외 댄서 공동 모집 채널'}]} canDecide={role!=='readonly'}/><div className="mt-5"><ApplicantOperations><p>운영 도구 확인용 콘텐츠</p><WithdrawalLinkPanel url="https://example.com/withdraw/long-token" grigoUrl="https://example.com/withdraw/grigo-long-token"/></ApplicantOperations></div></main> :
 mode==='bank' ? <BankPicker value={null} onChange={()=>{}}/> :
 mode==='casting' ? <ReviewProfileSheet open={true} onOpenChange={()=>{}} reviewToken="test" card={{memberId:'test',name:'한국어 이름과 LongEnglishNameForMobileLayout'}}/> :
 mode==='rates' ? <RateCardManager dancerId={did} initialCards={[]}/> :
 mode==='careers' ? <CareerHistoryManager dancerId={did} initialCareers={[]}/> :
 mode==='reject' ? <RejectReasonDialog open={true} onOpenChange={()=>{}} onConfirm={()=>{}} busy={false}/> :
 mode==='ops' ? <ProfilePreviewSheet open={true} onOpenChange={()=>{}} row={{name:'한국어 이름과 LongEnglishNameForMobileLayout',project_code:'QA',outreach_status:'pending',dancer_genres:['힙합'],dancer_specialties:['공연'],dancer_bio:'긴 한국어 문장과 https://example.com/'+ 'longpath'.repeat(25)}}/> :
 mode==='profile' ? <div className="p-4"><MessageDancerButton dancerId={did} dancerName="활동명이 매우 긴 지원자" projects={projects}/></div> :
 (mode==='applicant'||mode==='review') ? <ApplicantPortfolioSheet open={true} onOpenChange={()=>{}} projectId={pid} applicant={{applicationId:'application',dancerId:did,name:'활동명이 매우 긴 지원자의 한국어 이름과 EnglishNameLongEnoughToWrap',status:mode==='review'?'accepted':'pending',castingDetails:null}} onDecide={()=>{}} deciding={false}/> :
 mode==='inbox' ? <MessageViewport><header className="border-b p-3">프로젝트 메시지함</header><StaffInbox projectId={pid} projectTitle="프로젝트" initialRooms={[]} initialCampaigns={[]} initialRoomId={null}/></MessageViewport> :
 <MessageViewport><header className="shrink-0 border-b p-4">아주 긴 프로젝트명과 지원자 이름 · 대화</header><div className="min-h-0 flex-1"><ChatRoomView roomId={room.id} role={role} projectTitle="프로젝트" counterpartLabel="아주 긴 활동명을 가진 지원자" initialRoom={room} initialMessages={qa.messages.slice()} initialResponses={[]}/></div></MessageViewport>
);
`;

async function main() {
  const result = await build({ stdin: { contents: fixture, loader: 'tsx', resolveDir: root }, absWorkingDir: root,
    bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NEXT_PUBLIC_MESSAGING_ENABLED':'"true"' },
    plugins: [{name:'qa-stubs',setup(b){
      // Export the existing private sheet only in this isolated test bundle.
      b.onLoad({filter:/OpsBoardClient\.tsx$/},args=>({contents:fs.readFileSync(args.path,'utf8')+'\nexport { ProfilePreviewSheet };',loader:'tsx',resolveDir:path.dirname(args.path)}));
      b.onResolve({filter:/^@\/app\/actions\//},args=>({path:args.path,namespace:'actions'}));
      b.onLoad({filter:/.*/,namespace:'actions'},args=>{
        const source=fs.readFileSync(path.join(root,'src',args.path.slice(2)+'.ts'),'utf8');
        const names=[...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)].map(m=>m[1]);
        return { contents:names.map(n=>'export async function '+n+'(...args){return window.qa.action("'+n+'",...args)}').join('\n'),loader:'js'};
      });
      b.onResolve({filter:/^next\/(link|image|navigation)$/},args=>({path:args.path,namespace:'next'}));
      b.onLoad({filter:/.*/,namespace:'next'},args=>({contents:args.path==='next/navigation' ? 'export const useRouter=()=>({push:()=>{},refresh:()=>{}});' : 'import React from "react"; export default function Component(p){return React.createElement("'+(args.path==='next/link'?'a':'img')+'",p,p.children)}', resolveDir:root}));
    }}],
  });
  fs.writeFileSync(path.join(out,'bundle.js'),result.outputFiles[0].contents);
  const css = await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(fs.readFileSync(path.join(root,'src/app/globals.css'),'utf8'),{from:path.join(root,'src/app/globals.css')});
  fs.writeFileSync(path.join(out,'style.css'),css.css);
  const server=http.createServer((req,res)=>{
    const name=req.url.split('?')[0];
    if(name==='/bundle.js'||name==='/style.css'){res.setHeader('Content-Type',name.endsWith('js')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join(out,name)));}
    else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body class="font-sans" style="--font-inter:Arial;--font-jetbrains-mono:monospace"><div id="root"></div><script src="/bundle.js"></script></body></html>');}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+server.address().port;
  const checks=[];
  try {
    for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]) {
      const browser=await engine.launch({headless:true});
      try {
        for(const width of (process.env.QA_BASELINE ? [320] : process.env.QA_APPLICANTS_ONLY ? [320,360,390,430,844,1280] : process.env.QA_LAYOUT_ONLY || process.env.QA_SHEETS_ONLY ? [320,360,390,430,844] : [320,390,768,1440])) {
          const context=await browser.newContext({viewport:{width,height:width===844?390:844},isMobile:width<640,hasTouch:width<640});
          const page=await context.newPage();
          const errors=[];page.on('pageerror',e=>errors.push(e.message));
          for(const mode of (process.env.QA_APPLICANTS_ONLY ? ['console'] : process.env.QA_SHEETS_ONLY ? ['bank','casting','rates','careers','reject','ops'] : process.env.QA_LAYOUT_ONLY ? ['review'] : ['chat','profile','applicant','inbox'])) {
            await page.goto(url+'/?mode='+mode);
            if(process.env.QA_APPLICANTS_ONLY) {
              await page.getByPlaceholder('이름·모집채널로 검색…').waitFor();await page.waitForTimeout(350);
              await page.screenshot({path:path.join(out,name+'-'+width+'-list.png'),fullPage:true});
              if(process.env.QA_BASELINE)continue;
              assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'applicant list reflow');
              const search=page.getByRole('textbox',{name:'지원자 검색'});
              assert.ok(await search.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),'search readable without zoom');
              const tabBox=await page.getByRole('group',{name:'지원 단계'}).boundingBox();assert.ok(tabBox.height<=64,'stage tabs stay one row');
              const headline=await page.getByRole('heading',{level:1}).boundingBox();assert.ok(headline.width>=Math.min(width-34,700),'title not squeezed by actions');
              await page.getByRole('button',{name:'상세 필터',exact:true}).click();
              await page.getByPlaceholder('이상',{exact:true}).fill('160');
              assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'filter range reflows');
              await page.getByRole('checkbox').first().check();
              await page.screenshot({path:path.join(out,name+'-'+width+'-filters-selection.png'),fullPage:true});
              assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'bulk toolbar reflows');
              await page.getByRole('button',{name:'해제',exact:true}).click();
              await page.getByRole('button',{name:'필터 초기화',exact:true}).click();
              await page.getByRole('button',{name:'상세 필터',exact:true}).click();
              await search.fill('없는 지원자');await page.getByText('해당 조건의 지원자가 없습니다.').waitFor();await search.fill('');
              if(width<1024){assert.equal(await page.getByText('운영 도구 확인용 콘텐츠').isVisible(),false);await page.getByRole('button',{name:/프로젝트 운영 도구/}).click();await page.getByText('운영 도구 확인용 콘텐츠').waitFor();await page.getByRole('button',{name:/프로젝트 운영 도구/}).click();}else{await page.getByText('운영 도구 확인용 콘텐츠').waitFor();}
              checks.push(name+' '+width+' list, tabs, search, filters, selection, empty state and operations');
              await page.getByRole('button',{name:/LongEnglishDancerNameForMobileReview 프로필 보기/}).click();
              const dialog=page.getByRole('dialog');await dialog.getByText('지원자 프로필',{exact:true}).waitFor();
              const file=dialog.locator('a[href="https://example.com/portfolio.pdf"]');await file.waitFor();
              const footer=dialog.locator('[data-sheet-footer]');
              const assertFooter=async()=>{const g=await footer.boundingBox();assert.ok(g.y>=0&&g.y+g.height<=page.viewportSize().height+1&&g.height<=140,'compact review footer stays visible');};
              await page.waitForTimeout(350);await assertFooter();
              await page.screenshot({path:path.join(out,name+'-'+width+'-profile.png')});
              await file.scrollIntoViewIfNeeded();
              assert.ok(await file.evaluate(el=>{const tail=el.lastElementChild;return tail.getBoundingClientRect().width>=40&&tail.getBoundingClientRect().right<=el.getBoundingClientRect().right+1;}),'file link label retains space');
              await assertFooter();
              await dialog.getByRole('button',{name:'메시지 보내기',exact:true}).click();
              await page.getByRole('textbox',{name:'메시지 입력',exact:true}).waitFor();
              await page.getByRole('button',{name:'닫기',exact:true}).last().click();
              await dialog.getByText('지원자 프로필',{exact:true}).waitFor();await assertFooter();
              // This invokes only the stubbed action; verifies the existing round path is reused.
              await footer.getByRole('button',{name:'서류 심사 합격',exact:true}).click();
              await page.waitForFunction(()=>qa.mutations.some(m=>m.name==='setApplicationRoundAction'&&m.values.round==='1'));
              await footer.locator('button').last().click();
              await page.waitForFunction(()=>qa.mutations.some(m=>m.name==='setApplicationRoundAction'&&m.values.round==='2'));
              page.once('dialog',d=>d.dismiss());
              await footer.locator('button').last().click();
              assert.equal(await page.evaluate(()=>qa.mutations.some(m=>m.name==='setApplicationRoundAction'&&m.values.round==='3')),false,'final confirmation cancellation prevents mutation');
              await footer.getByRole('button',{name:'거절',exact:true}).click();
              await page.getByRole('dialog').getByText('거절 사유',{exact:true}).waitFor();
              await page.getByPlaceholder('직접 입력하거나 위 사유를 선택하세요…').fill('테스트 사유');
              await page.waitForTimeout(350);
              await page.screenshot({path:path.join(out,name+'-'+width+'-reject.png')});
              await page.getByRole('button',{name:'취소',exact:true}).click();
              await page.getByRole('dialog').getByText('지원자 프로필',{exact:true}).waitFor();
              assert.equal(await page.evaluate(()=>qa.mutations.some(m=>m.name==='decideApplicationAction')),false,'cancel rejection does not mutate');
              checks.push(name+' '+width+' profile, anchored actions, long file, message return, advance and cancel rejection');
              await page.goto(url+'/?mode=console&role=readonly');
              assert.equal(await page.getByRole('checkbox').count(),0,'readonly has no selection');
              await page.getByRole('button',{name:/LongEnglishDancerNameForMobileReview 프로필 보기/}).click();
              await page.getByRole('dialog').waitFor();
              assert.equal(await page.locator('[data-sheet-footer]').count(),0,'readonly has no review footer');
              assert.equal(await page.getByRole('button',{name:'메시지 보내기',exact:true}).count(),0,'readonly cannot start staff thread');
              checks.push(name+' '+width+' readonly profile');continue;
            }
            if(process.env.QA_SHEETS_ONLY) {
              if(mode==='bank')await page.getByRole('button',{name:'은행 선택',exact:true}).click();
              if(mode==='rates')await page.getByRole('button',{name:'추가',exact:true}).first().click();
              if(mode==='careers')await page.getByRole('button',{name:'새로운 이력 추가하기',exact:true}).click();
              const dialog=page.getByRole('dialog');await dialog.waitFor();await page.waitForTimeout(350);
              const geometry=await dialog.evaluate(el=>({overflow:el.scrollWidth-el.clientWidth,contentOverflow:el.querySelector('[data-sheet-content]').scrollWidth-el.querySelector('[data-sheet-content]').clientWidth,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,height:innerHeight}));
              assert.ok(geometry.overflow<=1&&geometry.contentOverflow<=1,name+' '+width+' '+mode+' sheet overflow: '+JSON.stringify(geometry));
              assert.ok(geometry.top>=-1&&geometry.bottom<=geometry.height+1,'sheet stays in viewport');
              await page.screenshot({path:path.join(out,name+'-'+width+'-'+mode+'.png')});
              if(mode==='bank') {await page.getByPlaceholder('은행명 검색 (예: 카카오, 농협, kb)').fill('카카오');await page.getByRole('button',{name:'카카오뱅크',exact:true}).click();await dialog.waitFor({state:'hidden'});}
              else {await page.getByRole('button',{name:'닫기',exact:true}).last().click();}
              checks.push(name+' '+width+' '+mode+' sheet layout and close');continue;
            }
            if(mode==='review') {
              const field=page.getByPlaceholder('예: 400,000');await field.waitFor();await page.waitForTimeout(350);await field.scrollIntoViewIfNeeded();
              await page.screenshot({path:path.join(out,name+'-'+width+'-review.png')});
              const geometry=await field.evaluate(el=>({font:parseFloat(getComputedStyle(el).fontSize),height:el.getBoundingClientRect().height,right:el.getBoundingClientRect().right,overflow:el.closest('[role="dialog"]').scrollWidth-el.closest('[role="dialog"]').clientWidth}));
              assert.equal(geometry.overflow,0,name+' '+width+' review content overflow');
              assert.ok(geometry.font>=16&&geometry.height>=44,name+' '+width+' review input readability');
              const saveFits=await field.evaluate(el=>{const button=el.parentElement.querySelector('button');return button.getBoundingClientRect().right<=el.parentElement.getBoundingClientRect().right+1;});
              assert.ok(saveFits,'settlement save button stays inside its row');
              const score=await page.getByRole('button',{name:'1점',exact:true}).boundingBox();assert.ok(score.width>=44&&score.height>=44,'score touch target');
              checks.push(name+' '+width+' review form, long title and score buttons');
              continue;
            }
            if(mode==='profile') {
              await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();
              await page.getByLabel('어떤 프로젝트로 연락할까요?').selectOption('11111111-1111-4111-8111-111111111111');
            }
            if(mode==='applicant') await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();
            if(mode==='inbox') await page.getByRole('button',{name:/아주 긴 활동명을 가진 지원자/}).click();
            const input=page.getByRole('textbox',{name:'메시지 입력',exact:true});
            await input.waitFor();
            await page.waitForTimeout(350); // BottomSheet entry animation must finish before geometry assertions.
            await input.fill('첫 줄\n둘째 줄');
            assert.equal(await input.inputValue(),'첫 줄\n둘째 줄',name+' '+width+' '+mode+' draft retained');
            const send=page.getByRole('button',{name:'보내기',exact:true});
            await page.screenshot({path:path.join(out,name+'-'+width+'-'+mode+'.png')});
            const bounds=await send.boundingBox();
            assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=845, name+' '+width+' '+mode+' composer visible');
            const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
            assert.equal(overflow,false,name+' '+width+' '+mode+' horizontal overflow');
            if(width===320&&mode==='chat') {
              await input.press('Enter');
              assert.equal(await page.evaluate(()=>qa.sends.length),0,'mobile Enter must not send');
              await page.setViewportSize({width,height:430});
              await page.waitForTimeout(150);
              const small=await send.boundingBox();assert.ok(small.y+small.height<=431,'composer visible in short viewport');
              await page.setViewportSize({width,height:844});
            }
            if(width===390&&mode==='chat') {
              await page.evaluate(()=>{qa.failed=true});
              await send.click();
              await page.getByRole('button',{name:/전송 확인 실패/}).waitFor();
              await input.fill('실패 이후 새로 작성한 내용');
              await page.evaluate(()=>{qa.messages.push(qa.message(qa.messages.length+1,'실패 중에 도착한 답장'))});
              await page.getByText('실패 중에 도착한 답장',{exact:true}).waitFor({timeout:12000});
              assert.equal(await input.inputValue(),'실패 이후 새로 작성한 내용');
              await page.evaluate(()=>{qa.failed=false;qa.interleave=true});
              await page.getByRole('button',{name:/전송 확인 실패/}).click();
              await page.getByText('동시에 도착한 상대 메시지',{exact:true}).waitFor({timeout:12000});
              const sends=await page.evaluate(()=>qa.sends);
              assert.equal(sends[0].clientMessageId,sends[1].clientMessageId,'retry preserves idempotency key');
              assert.equal(await input.inputValue(),'실패 이후 새로 작성한 내용');
              checks.push(name+' failure preservation, retry idempotency and interleaved receive');
              await page.evaluate(()=>{for(let i=0;i<30;i++)qa.messages.push(qa.message(qa.messages.length+1,'이전 대화 내용 '+i))});
              await page.getByText('이전 대화 내용 29',{exact:true}).waitFor({timeout:12000});
              await page.getByRole('log').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll',{bubbles:true}))});
              await page.evaluate(()=>qa.messages.push(qa.message(qa.messages.length+1,'과거 대화를 읽는 중 새 메시지')));
              await page.getByRole('button',{name:'새 메시지 보기 ↓'}).waitFor({timeout:12000});
              assert.equal(await page.getByRole('log').evaluate(el=>el.scrollTop),0,'incoming message preserves history scroll');
              await page.getByRole('button',{name:'새 메시지 보기 ↓'}).click();
              checks.push(name+' preserve history scroll');
            } else {
              await send.click();
              await page.waitForFunction(()=>qa.sends.length===1);
            }
            if(mode==='applicant') {
              await page.getByRole('button',{name:'닫기',exact:true}).last().click();
              await page.getByRole('button',{name:'메시지 보내기',exact:true}).waitFor();
            }
            if(mode==='profile') {
              await page.getByRole('button',{name:'닫기',exact:true}).click();
              await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();
              assert.equal(await page.getByLabel('어떤 프로젝트로 연락할까요?').inputValue(),'','reopen resets the project selection');
            }
            if(mode==='inbox'&&width<640) {
              await page.getByRole('button',{name:'목록으로',exact:true}).click();
              await page.getByRole('button',{name:'일괄 발송',exact:true}).click();
              assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'campaign tab stays inside mobile width');
            }
            checks.push(name+' '+width+' '+mode);
          }
          assert.deepEqual(errors,[]);
          await context.close();
        }
        if(process.env.QA_LAYOUT_ONLY||process.env.QA_SHEETS_ONLY||process.env.QA_APPLICANTS_ONLY)continue;
        // Member reply uses the same composer, with a different server action.
        const page=await browser.newPage({viewport:{width:390,height:844}});
        await page.goto(url+'/?role=member');
        await page.getByRole('textbox',{name:'메시지 입력',exact:true}).fill('지원자 회신');
        await page.getByRole('button',{name:'보내기',exact:true}).click();
        await page.waitForFunction(()=>qa.messages.some(m=>m.body==='지원자 회신'&&m.sender_role==='member'));
        checks.push(name+' member reply');
        await page.close();
      } finally { await browser.close(); }
    }
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checks,passed:checks.length},null,2));
    console.log(JSON.stringify({passed:checks.length,out},null,2));
  } finally { server.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
