"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  savePayoutAccountAction,
  saveResidentNumberAction,
} from "@/app/actions/settlements";
import {
  calcSettlement,
  formatWon,
  type SettlementStatus,
} from "@/lib/settlement";
import {
  PAYOUT_STAGE_LABEL,
  type SettlementPayoutStage,
} from "@/lib/payout-state";
import {
  DancerDocuments,
  type DancerDocsState,
} from "@/components/settlement/DancerDocuments";
import { BankPicker } from "@/components/settlement/BankPicker";
import { matchBank, type Bank } from "@/lib/banks";
import { formatResidentNumberInput } from "@/lib/payout-validation";

export type MySettlementRow = {
  id: string;
  dancerId: string;
  dancerName: string;
  projectTitle: string;
  grossAmount: number | null;
  rate: number;
  status: SettlementStatus;
  createdAt: string | null;
  paidAt: string | null;
  // 원장 기준 실제 지급 단계 — status는 잔액 출금 후에도 pending에 머문다.
  payoutStage: SettlementPayoutStage;
  payoutPaidAt: string | null;
  // 지급 처리 중(requested) 건의 안내용 입금 예정일 라벨("9/5(금)").
  // 하이드레이션 불일치를 피하려고 서버에서 계산해 내려준다.
  expectedPayoutLabel: string | null;
};

function fmtDateKST(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .replace(/\. /g, ".")
    .replace(/\.$/, "");
}

function fmtShortDateKST(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return month && day ? `${month}/${day}` : "";
}

export type PayoutAccount = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

export function MySettlements({
  settlements,
  accounts,
  payoutReady,
  residentNumberRegistered,
  docs,
  dancerNames,
  // 화이트라벨(/w GRIGO 호스트)에서 원천징수 주체 표기를 브랜드에 맞추기 위한 표시명.
  brandName = "deetz",
  // page = /me/settlements(출금하기 카드가 같은 화면 위에 있음)
  // share = /w 공유 링크(출금은 /me/settlements로 안내)
  variant = "page",
}: {
  settlements: MySettlementRow[];
  accounts: Record<string, PayoutAccount | null>;
  payoutReady: Record<string, boolean>;
  residentNumberRegistered: Record<string, boolean>;
  docs: Record<string, DancerDocsState>;
  dancerNames: Record<string, string>;
  brandName?: string;
  variant?: "page" | "share";
}) {
  const dancerIds = Object.keys(dancerNames);
  const allPayoutReady =
    dancerIds.length > 0 && dancerIds.every((id) => payoutReady[id] === true);
  // 지급 정보는 한 번 등록하면 끝이라, 완비된 경우 접어서 정산 내역을 위로 올린다.
  const [payoutInfoOpen, setPayoutInfoOpen] = useState(!allPayoutReady);

  return (
    <div className="flex flex-col gap-6">
      {/* 프로젝트별 정산 내역 */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-ink-2">프로젝트별 정산</h2>
        {settlements.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-sm text-ink-3">
            아직 정산 내역이 없어요. 참여한 프로젝트의 정산이 등록되면 여기에
            표시됩니다.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {settlements.map((s) => (
              <SettlementCard
                key={s.id}
                row={s}
                payoutReady={payoutReady[s.dancerId] === true}
                variant={variant}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 지급 정보 (계좌·주민번호·서류) — 등록 완료면 접힘 */}
      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setPayoutInfoOpen((v) => !v)}
          aria-expanded={payoutInfoOpen}
          className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card px-4 py-3"
        >
          <span className="text-sm font-bold text-ink-2">
            지급 정보 (계좌 · 등록번호 · 서류)
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-medium">
            {allPayoutReady ? (
              <span className="flex items-center gap-1 text-emerald-600">
                <Check size={13} aria-hidden /> 등록 완료
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                등록 필요
              </span>
            )}
            <ChevronDown
              size={15}
              aria-hidden
              className={`text-ink-3 transition-transform ${payoutInfoOpen ? "rotate-180" : ""}`}
            />
          </span>
        </button>

        {payoutInfoOpen ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold text-ink-3">입금 계좌</h3>
              {dancerIds.map((id) => (
                <AccountCard
                  key={id}
                  dancerId={id}
                  dancerName={dancerNames[id]}
                  showName={dancerIds.length > 1}
                  account={accounts[id] ?? null}
                />
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold text-ink-3">
                주민(외국인)등록번호
              </h3>
              {dancerIds.map((id) => (
                <ResidentNumberCard
                  key={id}
                  dancerId={id}
                  dancerName={dancerNames[id]}
                  showName={dancerIds.length > 1}
                  registered={residentNumberRegistered[id] === true}
                />
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold text-ink-3">정산 서류</h3>
              {dancerIds.map((id) => (
                <DancerDocuments
                  key={id}
                  dancerId={id}
                  dancerName={dancerNames[id]}
                  showName={dancerIds.length > 1}
                  docs={docs[id] ?? { idCard: false, bankbook: false }}
                />
              ))}
            </div>

            <p className="text-[11px] leading-relaxed text-ink-3">
              원천징수 3.3%는 플랫폼 수수료가 아니라 국세청에 납부되는
              세금(소득세 3% + 지방소득세 0.3%)이에요. {brandName}가 대신
              원천징수·신고하며, 매년 5월 종합소득세 신고 때 환급받으실 수도
              있어요.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

// 카드 하나 = 정산 1건. "지금 어디까지 왔고 다음이 언제인지"를 카드가 직접 말한다.
function SettlementCard({
  row: s,
  payoutReady,
  variant,
}: {
  row: MySettlementRow;
  payoutReady: boolean;
  variant: "page" | "share";
}) {
  // 금액 미확정 = 정산 확정 대기 카드 (진행 단계 표시).
  if (s.grossAmount == null) {
    return (
      <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold leading-tight">
              {s.projectTitle}
            </span>
            <span className="text-xs text-ink-3">{s.dancerName}</span>
          </div>
          <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-ink-3">
            정산 확정 대기
          </span>
        </div>
        <AwaitingSteps registeredAt={s.createdAt} />
        <p className="text-xs leading-relaxed text-ink-3">
          정산 정보 제출이 완료됐어요. 담당자가 금액을 확정하면 알림을
          드릴게요. 확정된 금액은 바로 출금 가능 잔액에 반영돼요.
        </p>
      </li>
    );
  }

  const calc = calcSettlement(s.grossAmount, s.rate);
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold leading-tight">
            {s.projectTitle}
          </span>
          <span className="text-xs text-ink-3">{s.dancerName}</span>
        </div>
        <StatusBadge stage={s.payoutStage} />
      </div>

      <div className="flex flex-col gap-1 rounded-xl bg-secondary/60 p-3">
        <div className="flex items-end justify-between">
          <span className="text-xs text-ink-3">정산 금액 (세전)</span>
          <span className="text-lg font-bold text-foreground">
            {formatWon(calc.gross)}
          </span>
        </div>
        <p className="text-[11px] text-ink-3">
          세금 {(calc.rate * 100).toFixed(1)}%(−{formatWon(calc.tax)})
          {s.payoutStage === "paid"
            ? ` 공제 후 ${formatWon(calc.net)} 지급 완료`
            : s.payoutStage === "requested" || s.payoutStage === "partially_paid"
              ? ` 공제 후 ${formatWon(calc.net)} 입금 예정`
              : ` 공제 후 ${formatWon(calc.net)}이 출금 가능 잔액에 반영돼요`}
        </p>
      </div>

      {s.payoutStage === "withdrawable" ? (
        payoutReady ? (
          variant === "share" ? (
            <Link
              href="/me/settlements"
              className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground transition-colors active:opacity-80"
            >
              출금 신청하러 가기 →
            </Link>
          ) : (
            <p className="text-xs text-ink-3">
              위 &lsquo;출금하기&rsquo;에서 원하는 금액만큼 출금을 신청할 수
              있어요.
            </p>
          )
        ) : (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            출금하려면 아래 &lsquo;지급 정보&rsquo;에서 입금 계좌와
            주민(외국인)등록번호를 등록해 주세요.
          </p>
        )
      ) : null}
      {s.payoutStage === "requested" || s.payoutStage === "partially_paid" ? (
        <p className="text-xs text-ink-3">
          출금 신청이 접수됐어요.
          {s.expectedPayoutLabel
            ? ` ${s.expectedPayoutLabel}에 등록하신 계좌로 입금될 예정이에요.`
            : " 담당자 확인 후 등록하신 계좌로 입금됩니다."}
        </p>
      ) : null}
      {s.payoutStage === "paid" ? (
        <p className="text-xs text-emerald-600">
          입금이 완료되었어요.
          {s.payoutPaidAt ? ` · ${fmtDateKST(s.payoutPaidAt)} 입금` : ""}
        </p>
      ) : null}
    </li>
  );
}

// 확정 대기 카드의 진행 단계: 정산 등록 ✓ → 금액 확정(진행 중) → 잔액 반영.
function AwaitingSteps({ registeredAt }: { registeredAt: string | null }) {
  const registeredDate = fmtShortDateKST(registeredAt);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500">
          <Check size={10} className="text-white" aria-hidden />
        </span>
        <span className="h-0.5 flex-1 bg-emerald-200" />
        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-amber-500 bg-card" />
        <span className="h-0.5 flex-1 bg-border" />
        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-border bg-card" />
      </div>
      <div className="flex justify-between text-[10px] leading-tight">
        <span className="text-emerald-600">
          정산 등록{registeredDate ? ` ${registeredDate}` : ""}
        </span>
        <span className="text-center font-medium text-amber-600">금액 확정</span>
        <span className="text-right text-ink-3">잔액 반영</span>
      </div>
    </div>
  );
}

function ResidentNumberCard({
  dancerId,
  dancerName,
  showName,
  registered,
}: {
  dancerId: string;
  dancerName: string;
  showName: boolean;
  registered: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!registered);
  const [residentNumber, setResidentNumber] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, startTransition] = useTransition();

  function save() {
    if (residentNumber.replace(/\D/g, "").length !== 13) {
      toast.error("주민(외국인)등록번호 13자리를 입력해 주세요.");
      return;
    }

    const fd = new FormData();
    fd.set("dancer_id", dancerId);
    fd.set("resident_registration_number", residentNumber);
    startTransition(async () => {
      const res = await saveResidentNumberAction(fd);
      if (res.ok) {
        toast.success("주민(외국인)등록번호를 저장했어요.");
        setResidentNumber("");
        setReveal(false);
        setEditing(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      {showName ? (
        <span className="text-xs font-semibold text-ink-2">{dancerName}</span>
      ) : null}
      {!editing && registered ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold">등록됨</span>
            <span className="text-xs text-ink-3">
              번호는 보안을 위해 다시 표시하지 않아요.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 active:bg-secondary"
          >
            변경
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <input
              type={reveal ? "text" : "password"}
              inputMode="numeric"
              autoComplete="off"
              value={residentNumber}
              onChange={(event) =>
                setResidentNumber(formatResidentNumberInput(event.target.value))
              }
              placeholder="주민(외국인)등록번호 13자리"
              aria-label="주민 또는 외국인 등록번호"
              maxLength={14}
              disabled={busy}
              className="w-full rounded-xl border border-border bg-background py-2 pl-3 pr-11 text-sm outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? "등록번호 가리기" : "등록번호 보기"}
              disabled={busy}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-2 active:bg-secondary disabled:opacity-50"
            >
              {reveal ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
            >
              {busy ? "저장 중…" : "등록번호 저장"}
            </button>
            {registered ? (
              <button
                type="button"
                onClick={() => {
                  setResidentNumber("");
                  setReveal(false);
                  setEditing(false);
                }}
                disabled={busy}
                className="rounded-xl border border-border px-4 py-2.5 text-sm text-ink-2 active:bg-secondary"
              >
                취소
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-ink-3">
            원천징수 신고와 정산 처리에만 사용하며 담당자만 확인할 수 있어요.
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ stage }: { stage: SettlementPayoutStage }) {
  const tone =
    stage === "paid"
      ? "bg-emerald-100 text-emerald-700"
      : stage === "requested" || stage === "partially_paid"
        ? "bg-amber-100 text-amber-700"
        : stage === "awaiting_amount"
          ? "bg-secondary text-ink-3"
          : "bg-blue-100 text-blue-700";
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {PAYOUT_STAGE_LABEL[stage]}
    </span>
  );
}

function AccountCard({
  dancerId,
  dancerName,
  showName,
  account,
}: {
  dancerId: string;
  dancerName: string;
  showName: boolean;
  account: PayoutAccount | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!account);
  const [busy, startTransition] = useTransition();
  const [bank, setBank] = useState<Bank | null>(matchBank(account?.bankName));
  const [accountNumber, setAccountNumber] = useState(
    account?.accountNumber ?? "",
  );
  const [accountHolder, setAccountHolder] = useState(
    account?.accountHolder ?? "",
  );
  const [reveal, setReveal] = useState(false);

  function save() {
    if (!bank || !accountNumber.trim() || !accountHolder.trim()) {
      toast.error("은행·계좌번호·예금주를 모두 입력해 주세요.");
      return;
    }
    const fd = new FormData();
    fd.set("dancer_id", dancerId);
    fd.set("bank_name", bank.transfer);
    fd.set("bank_code", bank.code);
    fd.set("bank_account_number", accountNumber);
    fd.set("bank_account_holder", accountHolder);
    startTransition(async () => {
      const res = await savePayoutAccountAction(fd);
      if (res.ok) {
        toast.success("계좌를 저장했어요.");
        setEditing(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      {showName ? (
        <span className="text-xs font-semibold text-ink-2">{dancerName}</span>
      ) : null}
      {!editing && account ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5 text-sm">
            <span className="truncate font-semibold">
              {account.bankName}{" "}
              {reveal ? account.accountNumber : maskAccount(account.accountNumber)}
            </span>
            <span className="text-xs text-ink-3">
              예금주 {account.accountHolder}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "가리기" : "계좌번호 전체 보기"}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-ink-2 active:bg-secondary"
            >
              {reveal ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 active:bg-secondary"
            >
              변경
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <BankPicker value={bank} onChange={setBank} disabled={busy} />
          <input
            inputMode="numeric"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="계좌번호 (- 없이)"
            disabled={busy}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            value={accountHolder}
            onChange={(e) => setAccountHolder(e.target.value)}
            placeholder="예금주"
            disabled={busy}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
            >
              {busy ? "저장 중…" : "계좌 저장"}
            </button>
            {account ? (
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={busy}
                className="rounded-xl border border-border px-4 py-2.5 text-sm text-ink-2 active:bg-secondary"
              >
                취소
              </button>
            ) : null}
          </div>
          <p className="text-[11px] text-ink-3">
            계좌 정보는 정산 담당자만 확인할 수 있어요.
          </p>
        </div>
      )}
    </div>
  );
}

function maskAccount(num: string): string {
  const s = num.replace(/\s/g, "");
  if (s.length <= 4) return s;
  return `${s.slice(0, 3)}${"*".repeat(Math.max(0, s.length - 6))}${s.slice(-3)}`;
}
