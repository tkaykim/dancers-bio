"use client";

import { useState, useTransition } from "react";
import { quickApplyAction } from "@/app/actions/quick-apply";

/** 제작 가이드(노션). 메일에서 쓰는 것과 같은 주소다. */
const GUIDE_URL =
  "https://brief-blouse-1fb.notion.site/LG-_-dee-tz-3bcce086cc1880af9b10cd1a190ffe4a";

/**
 * 로그인 없는 접수 폼.
 * 성공하면 업로드 링크를 바로 화면에 띄운다 — 메일을 기다리게 하면 그 사이 이탈한다.
 */
export function QuickApplyForm({ code }: { code: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ submitUrl: string; alreadyApplied: boolean } | null>(null);

  if (done) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <p className="text-lg font-bold text-neutral-900">
          {done.alreadyApplied ? "이미 접수하셨습니다" : "접수 완료되었습니다"}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          {done.alreadyApplied
            ? "같은 인스타그램 아이디로 접수한 내역이 있습니다."
            : "가이드를 확인하신 뒤 촬영해 주세요."}
        </p>

        {/*
          가이드를 먼저 읽게 한다. 촬영 전에 음원·해시태그·계정 태그를 모르면
          영상을 다시 찍어야 하고, 그게 마감을 밀리게 하는 가장 흔한 원인이다.
          업로드는 촬영을 마친 뒤의 일이라 아래로 내린다.
        */}
        <a
          href={GUIDE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 block rounded-xl bg-neutral-900 py-4 text-center text-base font-bold text-white"
        >
          제작 가이드 먼저 확인하기
        </a>

        <div className="mt-5 rounded-xl bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">촬영 전 꼭 확인</p>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-amber-900">
            <li>· 음원은 인스타그램 오디오 탭에서 &lsquo;AI-DOL I Wash&rsquo; 를 직접 선택</li>
            <li>· 해시태그 #광고 #iwash #aidol</li>
            <li>· 계정 태그 @awc.ent</li>
          </ul>
          <p className="mt-2 text-xs text-amber-800">
            하나라도 빠지면 광고 건으로 인정되지 않습니다.
          </p>
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-5">
          <p className="text-sm font-semibold text-neutral-900">촬영을 마치셨다면</p>
          <a
            href={done.submitUrl}
            className="mt-2 block rounded-xl border border-neutral-900 py-3.5 text-center text-base font-bold text-neutral-900"
          >
            영상 올리러 가기
          </a>
          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            같은 내용을 메일로도 보내드립니다.
            <br />
            아래는 본인 전용 업로드 링크입니다. 나중에 올리실 거라면 저장해 두세요.
            <br />
            {done.submitUrl}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const res = await quickApplyAction(code, fd);
          if (res.ok) setDone({ submitUrl: res.submitUrl, alreadyApplied: res.alreadyApplied });
          else setError(res.error);
        });
      }}
    >
      <Field name="name" label="이름" placeholder="홍길동" autoComplete="name" />
      <Field
        name="instagram"
        label="인스타그램 아이디"
        placeholder="deetz.kr"
        hint="영상 파일과 게시물 확인에 사용됩니다. @ 없이 아이디만 적어주세요."
      />
      <Field
        name="email"
        label="이메일"
        type="email"
        placeholder="dancer@example.com"
        autoComplete="email"
        hint="가이드라인과 업로드 링크를 보내드립니다."
      />
      <Field name="phone" label="전화번호" type="tel" placeholder="01012345678" autoComplete="tel" />

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-neutral-900 py-4 text-base font-bold text-white disabled:opacity-50"
      >
        {pending ? "접수 중..." : "접수하기"}
      </button>

      <p className="text-center text-xs text-neutral-500">
        접수 시 deetz{" "}
        <a href="/terms" className="underline">
          이용약관
        </a>
        {" 및 "}
        <a href="/privacy" className="underline">
          개인정보처리방침
        </a>
        에 동의하는 것으로 봅니다.
      </p>
    </form>
  );
}

function Field({
  name,
  label,
  hint,
  ...rest
}: {
  name: string;
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-neutral-900">{label}</span>
      <input
        name={name}
        required
        className="mt-1.5 w-full rounded-xl border border-neutral-300 px-4 py-3 text-base outline-none focus:border-neutral-900"
        {...rest}
      />
      {hint ? <span className="mt-1.5 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}
