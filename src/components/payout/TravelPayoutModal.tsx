"use client";

import { useState, useTransition } from "react";
import { submitTravelPayoutAction } from "@/app/actions/travel-payout";

const BANKS = [
  "국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "농협은행",
  "기업은행",
  "카카오뱅크",
  "토스뱅크",
  "케이뱅크",
  "새마을금고",
  "수협은행",
  "SC제일은행",
  "씨티은행",
  "대구은행",
  "부산은행",
  "광주은행",
  "전북은행",
  "경남은행",
  "우체국",
  "신협",
];

export function TravelPayoutModal({
  token,
  name,
  initial,
}: {
  token: string;
  name: string;
  initial: {
    account_holder: string | null;
    bank_name: string | null;
    account_number: string | null;
    contact: string | null;
    submitted: boolean;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 text-center shadow-xl ring-1 ring-black/5">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl">
          ✅
        </div>
        <p className="text-lg font-bold text-zinc-900">계좌정보가 저장됐어요</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          {name}님, 제출해 주셔서 감사합니다.
          <br />
          교통비는 확인 후 입력해 주신 계좌로 지급될 예정입니다.
          <br />이 창은 닫으셔도 됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl ring-1 ring-black/5">
      <div className="mb-1 text-xs font-bold text-zinc-400">교통비 지급 안내</div>
      <h1 className="text-lg font-bold leading-snug text-zinc-900">
        {name}님, 교통비를 받을
        <br />
        계좌정보를 입력해 주세요
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
        연습에 참석해주신 것에 대한 교통비를 지급해 드립니다.
        <br />
        로그인 없이 바로 저장되며, 본인과 담당자에게만 보입니다.
      </p>

      <form
        action={(fd) => {
          setError(null);
          startTransition(async () => {
            const r = await submitTravelPayoutAction(fd);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setDone(true);
          });
        }}
        className="mt-5 flex flex-col gap-3.5"
      >
        <input type="hidden" name="token" value={token} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="account_holder" className="text-[13px] font-semibold text-zinc-700">
            예금주
          </label>
          <input
            id="account_holder"
            name="account_holder"
            type="text"
            required
            defaultValue={initial.account_holder ?? name}
            placeholder="예: 홍길동"
            className="h-12 rounded-xl border border-zinc-200 bg-white px-4 text-base text-zinc-900 outline-none placeholder:text-zinc-300 focus:border-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="bank_name" className="text-[13px] font-semibold text-zinc-700">
            은행
          </label>
          <select
            id="bank_name"
            name="bank_name"
            required
            defaultValue={initial.bank_name ?? ""}
            className="h-12 rounded-xl border border-zinc-200 bg-white px-3 text-base text-zinc-900 outline-none focus:border-zinc-900"
          >
            <option value="" disabled>
              은행 선택
            </option>
            {BANKS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="account_number" className="text-[13px] font-semibold text-zinc-700">
            계좌번호
          </label>
          <input
            id="account_number"
            name="account_number"
            type="text"
            inputMode="numeric"
            required
            defaultValue={initial.account_number ?? ""}
            placeholder="‘-’ 없이 숫자만 입력해도 됩니다"
            className="h-12 rounded-xl border border-zinc-200 bg-white px-4 text-base text-zinc-900 outline-none placeholder:text-zinc-300 focus:border-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact" className="text-[13px] font-semibold text-zinc-700">
            연락처 <span className="font-normal text-zinc-400">· 선택</span>
          </label>
          <input
            id="contact"
            name="contact"
            type="tel"
            inputMode="tel"
            defaultValue={initial.contact ?? ""}
            placeholder="010-0000-0000"
            className="h-12 rounded-xl border border-zinc-200 bg-white px-4 text-base text-zinc-900 outline-none placeholder:text-zinc-300 focus:border-zinc-900"
          />
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 h-12 rounded-xl bg-zinc-900 text-base font-bold text-white transition disabled:opacity-50"
        >
          {pending ? "저장 중…" : initial.submitted ? "수정 저장하기" : "제출하기"}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-zinc-400">
          입력하신 계좌정보는 교통비 지급 목적 외에는 사용되지 않습니다.
        </p>
      </form>
    </div>
  );
}
