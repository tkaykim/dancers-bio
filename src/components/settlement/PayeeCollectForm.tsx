"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { submitPayeeCollectAction } from "@/app/actions/payee-collect";
import { BankPicker } from "@/components/settlement/BankPicker";
import { formatResidentNumberInput } from "@/lib/payout-validation";
import { type Bank } from "@/lib/banks";

// 일회성 수취인(계정 없음)의 지급정보 제출 폼 — 1회용 토큰 링크(/payee/<token>).
// 기존 PII는 절대 프리필하지 않는다(설계 §3.7) — 마스킹 안내만.
export function PayeeCollectForm({
  token,
  payeeName,
  taxMode,
  hasBrn,
}: {
  token: string;
  payeeName: string;
  taxMode: "withholding" | "invoice";
  hasBrn: boolean;
}) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [rrn, setRrn] = useState("");
  const [brn, setBrn] = useState("");
  const [busy, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function submit() {
    if (!bank || !accountNumber.trim() || !accountHolder.trim()) {
      toast.error("은행·계좌번호·예금주를 모두 입력해 주세요.");
      return;
    }
    if (taxMode === "withholding" && !rrn.trim()) {
      toast.error("주민(외국인)등록번호를 입력해 주세요.");
      return;
    }
    if (taxMode === "invoice" && !hasBrn && !brn.trim()) {
      toast.error("사업자등록번호를 입력해 주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("token", token);
    fd.set("bank_name", bank.transfer);
    fd.set("bank_code", bank.code);
    fd.set("bank_account_number", accountNumber);
    fd.set("bank_account_holder", accountHolder);
    if (rrn.trim()) fd.set("resident_registration_number", rrn);
    if (brn.trim()) fd.set("business_registration_number", brn);
    startTransition(async () => {
      const res = await submitPayeeCollectAction(fd);
      if (res.ok) {
        toast.success("지급 정보를 제출했어요.");
        setDone(true);
      } else {
        toast.error(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <p className="text-base font-bold text-emerald-800">제출 완료됐어요 ✓</p>
        <p className="text-sm text-emerald-700">
          담당자가 확인 후 지급을 진행합니다.
          <br />
          이 링크는 1회용이라 다시 열 수 없어요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
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

      {taxMode === "invoice" ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-2">
            사업자등록번호
          </label>
          <input
            inputMode="numeric"
            value={brn}
            onChange={(e) => setBrn(e.target.value)}
            placeholder={hasBrn ? "이미 등록됨 (변경 시에만 입력)" : "숫자 10자리"}
            disabled={busy}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <p className="text-[11px] text-ink-3">
            사업자 지급 건은 세금계산서 발행·수취 확인 후 부가세 포함 금액으로
            이체됩니다.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-2">
            주민(외국인)등록번호
          </label>
          <input
            inputMode="numeric"
            value={rrn}
            onChange={(e) => setRrn(formatResidentNumberInput(e.target.value))}
            placeholder="‘-’ 포함 입력"
            disabled={busy}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <p className="text-[11px] text-ink-3">
            세금 원천징수(3.3%) 신고에 필요해요. 정산 담당자만 확인할 수 있고
            안전하게 분리 보관돼요.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-1 flex h-12 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
      >
        {busy ? "제출 중…" : "지급 정보 제출"}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-ink-3">
        {payeeName}님 지급을 위한 정보예요. 이 링크는 1회 제출 후 만료됩니다.
      </p>
    </div>
  );
}
