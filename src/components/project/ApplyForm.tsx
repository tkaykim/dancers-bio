"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyToProjectAction } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type ApplyAsOption =
  | { kind: "individual"; dancer_id: string; label: string }
  | { kind: "team"; team_id: string; label: string };

export function ApplyForm({
  projectId,
  applyOptions,
}: {
  projectId: string;
  applyOptions: ApplyAsOption[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>(
    applyOptions[0] ? toValue(applyOptions[0]) : "",
  );

  if (applyOptions.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card p-4 text-sm text-ink-3">
        지원하려면 댄서 포트폴리오가 필요합니다.
      </p>
    );
  }

  return (
    <form
      action={(formData) => {
        setMessage(null);
        formData.set("project_id", projectId);
        formData.set("apply_as", selected);
        // 시나리오 2: 어떤 dancer 로 지원하는지 명시적으로 전달.
        // applyToProjectAction(v2) 의 dancer_id 폴백 분기가 본인/매니저 권한 검증 후 수용.
        const sel = applyOptions.find((o) => toValue(o) === selected);
        if (sel?.kind === "individual") {
          formData.set("dancer_id", sel.dancer_id);
        }
        startTransition(async () => {
          const result = await applyToProjectAction(formData);
          if (!result.ok) {
            setMessage({ kind: "error", text: result.error });
            return;
          }
          setMessage({ kind: "ok", text: "지원이 완료됐습니다." });
          router.refresh();
        });
      }}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
    >
      {applyOptions.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="apply_as">지원 자격</Label>
          <select
            id="apply_as"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {applyOptions.map((opt) => (
              <option key={toValue(opt)} value={toValue(opt)}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-xs text-ink-3">{applyOptions[0].label}로 지원합니다.</p>
      )}

      <Label htmlFor="cover_message" className="text-xs uppercase tracking-[0.14em] text-ink-3">
        ↳ 한 줄 자기소개 (선택)
      </Label>
      <textarea
        id="cover_message"
        name="cover_message"
        rows={3}
        maxLength={500}
        placeholder="예: 백업 7년차, K-pop 다수 경험 보유. 빠른 캐치 자신 있어요."
        className="rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {message ? (
        <p
          className={
            "rounded-md px-3 py-2 text-sm " +
            (message.kind === "ok"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive")
          }
        >
          {message.text}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full" size="lg">
        {pending ? "지원하는 중..." : "지원하기"}
      </Button>
    </form>
  );
}

function toValue(opt: ApplyAsOption): string {
  return opt.kind === "individual"
    ? `individual:${opt.dancer_id}`
    : `team:${opt.team_id}`;
}

export function WithdrawButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm("지원을 취소하시겠습니까?")) return;
        const fd = new FormData();
        fd.set("application_id", applicationId);
        startTransition(async () => {
          const { withdrawApplicationAction } = await import("@/app/actions/applications");
          const result = await withdrawApplicationAction(fd);
          if (!result.ok) {
            alert(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      {pending ? "취소 중..." : "지원 취소"}
    </Button>
  );
}
