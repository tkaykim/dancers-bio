"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addCampaignAction } from "@/app/actions/campaign-results";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Editor, ErrorText, useAction } from "./Controls";
export function AddCampaign({ projects }: { projects: { id: string; title: string }[] }) {
  const [project, setProject] = useState("");
  const action = useAction(), router = useRouter();
  return <Editor title="캠페인 추가" variant="default">
    <p className="text-sm text-ink-3">성과를 관리할 프로젝트를 선택해 주세요.</p>
    <SearchableSelect ariaLabel="캠페인 프로젝트" options={projects.map(p => ({ value: p.id, label: p.title }))} value={project} onChange={setProject} placeholder="프로젝트 선택" searchPlaceholder="프로젝트 제목 검색" />
    {!projects.length && <p className="text-ink-3">추가할 수 있는 프로젝트가 없습니다.</p>}
    <Button disabled={!project || action.pending} onClick={() => action.run(() => addCampaignAction(project), () => router.push(`/tools/campaigns/${project}`))}>{action.pending ? "추가 중…" : "캠페인 추가"}</Button>
    <ErrorText error={action.error} />
  </Editor>;
}
