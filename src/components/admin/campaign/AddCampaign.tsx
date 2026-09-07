"use client";

import { useRouter } from "next/navigation";
import { addCampaignAction } from "@/app/actions/campaign-results";
import {
  buttonClass,
  Editor,
  ErrorText,
  inputClass,
  useAction,
} from "./Controls";
export function AddCampaign({
  projects,
}: {
  projects: {
    id: string;
    title: string;
  }[];
}) {
  const action = useAction(),
    router = useRouter();
  return (
    <Editor title="캠페인 추가">
      <form
        className="flex flex-wrap gap-3"
        action={(f) => {
          const project = String(f.get("project"));
          action.run(
            () => addCampaignAction(project),
            () => router.push(`/tools/campaigns/${project}`),
          );
        }}
      >
        <select
          name="project"
          required
          aria-label="캠페인 프로젝트"
          className={inputClass}
        >
          <option value="">프로젝트 선택</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <button className={buttonClass} disabled={action.pending}>
          캠페인 추가
        </button>
      </form>
      <ErrorText error={action.error} />
    </Editor>
  );
}
