"use client";
import { useState } from "react";
import { copyText } from "@/lib/clipboard";
export function CampaignShare({projectId}:{projectId:string}) {
  const [message,setMessage]=useState("");
  return <div className="flex flex-wrap items-center gap-2 text-xs"><button className="underline" onClick={async()=>{const url=`${window.location.origin}/tools/campaigns/${projectId}?tab=submissions`;setMessage(await copyText(url)?"운영 링크를 복사했습니다.":url);}}>관리자 공유 링크 복사</button><span className="text-ink-3">관리자·해당 프로젝트 공동관리자 로그인 필요</span><span role="status">{message}</span></div>;
}
