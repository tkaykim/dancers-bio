"use client";
import { useState } from "react";
export function CampaignShare({projectId}:{projectId:string}) {
  const [message,setMessage]=useState("");
  return <div className="flex flex-wrap items-center gap-2 text-xs"><button className="underline" onClick={async()=>{try{await navigator.clipboard.writeText(`${window.location.origin}/tools/campaigns/${projectId}?tab=submissions`);setMessage("운영 링크를 복사했습니다.");}catch{setMessage("주소창의 링크를 복사해 주세요.");}}}>관리자 공유 링크 복사</button><span className="text-ink-3">관리자·해당 프로젝트 공동관리자 로그인 필요</span><span role="status">{message}</span></div>;
}
