"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { submitSettlementCollectionAction } from "@/app/actions/settlements";
import { BankPicker } from "@/components/settlement/BankPicker";
import { matchBank, type Bank } from "@/lib/banks";

export type CollectDancer = {
  id: string;
  name: string;
  account: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  } | null;
  hasRrn: boolean;
};

// 댄서가 수집 링크(/settle/<code>)에서 본인 지급정보를 셀프 제출하는 폼.
// 금액은 받지 않는다 — 안무가(소유자)가 콘솔에서 정한다.
export function SettlementCollectForm({
  code,
  projectTitle,
  dancers,
}: {
  code: string;
  projectTitle: string;
  dancers: CollectDancer[];
}) {
  const [dancerId, setDancerId] = useState(dancers[0]?.id ?? "");
  const current = dancers.find((d) => d.id === dancerId) ?? dancers[0];

  const [bank, setBank] = useState<Bank | null>(
    matchBank(current?.account?.bankName),
  );
  const [accountNumber, setAccountNumber] = useState(
    current?.account?.accountNumber ?? "",
  );
  const [accountHolder, setAccountHolder] = useState(
    current?.account?.accountHolder ?? "",
  );
  const [rrn, setRrn] = useState("");
  const [busy, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function onPickDancer(id: string) {
    setDancerId(id);
    const d = dancers.find((x) => x.id === id) ?? null;
    setBank(matchBank(d?.account?.bankName));
    setAccountNumber(d?.account?.accountNumber ?? "");
    setAccountHolder(d?.account?.accountHolder ?? "");
    setRrn("");
  }

  function submit() {
    if (!bank || !accountNumber.trim() || !accountHolder.trim()) {
      toast.error("은행·계좌번호·예금주를 모두 입력해 주세요.");
      return;
    }
    if (!current?.hasRrn && !rrn.trim()) {
      toast.error("주민(외국인)등록번호를 입력해 주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("code", code);
    fd.set("dancer_id", dancerId);
    fd.set("bank_name", bank.transfer);
    fd.set("bank_code", bank.code);
    fd.set("bank_account_number", accountNumber);
    fd.set("bank_account_holder", accountHolder);
    if (rrn.trim()) fd.set("resident_registration_number", rrn);
    startTransition(async () => {
      const res = await submitSettlementCollectionAction(fd);
      if (res.ok) {
        toast.success("정산 정보를 제출했어요.");
        setDone(true);
      } else {
        toast.error(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <p className="text-base font-bold text-emerald-800">
          제출 완료됐어요 ✓
        </p>
        <p className="text-sm text-emerald-700">
          정산 금액이 확정되면 알림으로 안내드릴게요.
          <br />
          정산 현황은 마이 → 정산·출금에서 확인할 수 있어요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {dancers.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-2">
            제출할 프로필
          </label>
          <select
            value={dancerId}
            onChange={(e) => onPickDancer(e.target.value)}
            disabled={busy}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {dancers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-ink-2">입금 은행</label>
        <BankPicker value={bank} onChange={setBank} disabled={busy} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-ink-2">계좌번호</label>
        <input
          inputMode="numeric"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          placeholder="계좌번호 (- 없이)"
          disabled={busy}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-ink-2">예금주</label>
        <input
          value={accountHolder}
          onChange={(e) => setAccountHolder(e.target.value)}
          placeholder="예금주명"
          disabled={busy}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-ink-2">
          주민(외국인)등록번호
        </label>
        <input
          inputMode="numeric"
          value={rrn}
          onChange={(e) => setRrn(e.target.value)}
          placeholder={
            current?.hasRrn ? "이미 등록됨 (변경 시에만 입력)" : "‘-’ 포함 입력"
          }
          disabled={busy}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <p className="text-[11px] text-ink-3">
          세금 원천징수(3.3%) 신고에 필요해요. 정산 담당자만 확인할 수 있고
          안전하게 분리 보관돼요.
        </p>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-1 flex h-12 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
      >
        {busy ? "제출 중…" : "정산 정보 제출"}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-ink-3">
        ‘{projectTitle}’ 참여 정산을 위한 정보예요.
        <br />
        금액은 안무가/담당자가 확정하며, 3.3% 세금 공제 후 입금됩니다.
      </p>
    </div>
  );
}
