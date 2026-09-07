"use client";
import {useState,useTransition} from "react";
import {saveManualParticipant,searchCampaignProfiles} from "@/app/actions/campaign-participants";
import type {Participant} from "@/lib/campaign/submissions";
import {Editor,buttonClass,inputClass,ErrorText} from "./Controls";
export function ManualParticipantEditor({project,person,onSaved}:{project:string;person?:Participant;onSaved:()=>void|Promise<void>}){
  const [open,setOpen]=useState(false);
  const form=<ManualFields key={person?`${person.id}-${person.version}`:String(open)} project={project} person={person} onSaved={async()=>{await onSaved();setOpen(false);}}/>;
  return person?<details className="my-4 rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">수기 참여자 정보·프로필 연결 수정</summary><div className="mt-4">{form}</div></details>:<Editor title="참여자 수기 추가" open={open} onOpenChange={setOpen}>{form}</Editor>;
}
function ManualFields({project,person,onSaved}:{project:string;person?:Participant;onSaved:()=>Promise<void>}){
  const [requestId]=useState(()=>crypto.randomUUID());
  const [name,setName]=useState(person?.display_name??""),[ig,setIg]=useState(person?.ig_handle??""),[dancer,setDancer]=useState(person?.dancer_id??"");
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<Awaited<ReturnType<typeof searchCampaignProfiles>>>([]);
  const [pending,start]=useTransition(),[error,setError]=useState<string|null>(null);
  return <form className="space-y-4" onSubmit={e=>{e.preventDefault();const fields=new FormData(e.currentTarget);setError(null);start(async()=>{try{const result=await saveManualParticipant(project,{request_id:requestId,...(person?{participant_id:person.id,version:person.version}:{}),display_name:name,ig_handle:ig,dancer_id:dancer||null,owner_label:fields.get("owner"),note:fields.get("note"),client_visible:fields.get("public")==="on"});if(!result.ok)setError(result.error);else await onSaved();}catch{setError("저장 결과를 확인하지 못했습니다. 새로고침해 주세요.");}});}}>
    <p className="text-sm text-ink-3">별도로 연락해 진행이 확정된 참여자를 등록합니다.<br/>deetz 가입이나 프로필이 없어도 예산·게시물 링크를 관리할 수 있습니다.</p>
    <fieldset className="space-y-2 rounded-xl border border-border p-3"><legend className="px-1 text-sm">기존 deetz 프로필 연결 (선택)</legend><div className="flex gap-2"><input aria-label="기존 프로필 검색어" value={query} onChange={e=>setQuery(e.target.value)} placeholder="활동명으로 검색" className={`${inputClass} min-w-0 flex-1`}/><button type="button" disabled={pending||query.trim().length<2} className={buttonClass} onClick={()=>start(async()=>{try{setResults(await searchCampaignProfiles(project,query));}catch{setError("프로필을 검색하지 못했습니다.");}})}>프로필 검색</button></div>
      <select aria-label="연결할 deetz 프로필" value={dancer} className={`${inputClass} w-full`} onChange={e=>{setDancer(e.target.value);const selected=results.find(r=>r.id===e.target.value);if(selected){setName(selected.name??name);setIg(selected.instagram??ig);}}}><option value="">프로필 없이 등록</option>{person?.dancer_id&&!results.some(r=>r.id===person.dancer_id)&&<option value={person.dancer_id}>현재 연결된 프로필</option>}{results.map(r=><option key={r.id} value={r.id}>{r.name} · {r.instagram??"계정 미등록"} · {r.hasAccount?"가입 회원":"프로필만 있음"}</option>)}</select>
      <p className="text-xs text-ink-3">동명이인은 Instagram 계정으로 확인해 주세요.<br/>프로필에 회원 계정이 연결돼 있으면 본인이 링크를 제출할 수 있습니다.</p></fieldset>
    <label className="block text-sm">표시 이름<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} className={`${inputClass} mt-1 w-full`}/></label>
    <label className="block text-sm">Instagram 계정 또는 프로필 URL<input value={ig} onChange={e=>setIg(e.target.value)} className={`${inputClass} mt-1 w-full`}/></label>
    <label className="block text-sm">담당자<input name="owner" maxLength={100} defaultValue={person?.owner_label??""} className={`${inputClass} mt-1 w-full`}/></label>
    <label className="block text-sm">연락·확인 근거<textarea name="note" required maxLength={2000} defaultValue={person?.note??""} className={`${inputClass} mt-1 w-full`} placeholder="누가 언제 진행을 확인했는지와 프로필 연결 근거를 남겨 주세요."/></label>
    <label className="flex items-start gap-2 text-sm"><input name="public" type="checkbox" defaultChecked={person?.client_visible??false} className="mt-1"/>클라이언트 업로드 현황에도 표시<br/>캠페인 공개 설정이 켜진 경우에만 반영됩니다.</label>
    <ErrorText error={error}/><button disabled={pending} className={buttonClass}>{pending?"저장 중…":person?"참여자 정보 저장":"확정 참여자 추가"}</button>
  </form>;
}
