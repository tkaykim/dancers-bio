"use client";

import { useState, useTransition } from "react";
import { quickApplyAction } from "@/app/actions/quick-apply";
import { translator } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";

/**
 * 로그인 없는 접수 폼.
 * 성공하면 업로드 링크를 바로 화면에 띄운다 — 메일을 기다리게 하면 그 사이 이탈한다.
 *
 * locale 은 페이지가 공고 언어를 보고 정해 내려준다. 서버 액션이 돌려주는 에러도
 * 같은 언어로 오므로, 이 화면 안에서 언어가 섞이지 않는다.
 */
export function QuickApplyForm({
  code,
  channel,
  guideUrl,
  locale,
}: {
  code: string;
  channel?: string | null;
  /** 공고에 등록된 제작 가이드. 없으면 가이드 버튼을 띄우지 않는다. */
  guideUrl?: string | null;
  locale: Locale;
}) {
  const t = translator(locale);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ submitUrl: string; state: "new" | "existing" | "rejoined" } | null>(
    null,
  );

  if (done) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <p className="text-lg font-bold text-neutral-900">
          {done.state === "rejoined"
            ? t("apply.done.rejoined.title")
            : done.state === "existing"
              ? t("apply.done.existing.title")
              : t("apply.done.new.title")}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          {done.state === "rejoined"
            ? t("apply.done.rejoined.body")
            : done.state === "existing"
              ? t("apply.done.existing.body")
              : t("apply.done.new.body")}
        </p>

        {/*
          가이드를 먼저 읽게 한다. 촬영 전에 음원·해시태그·계정 태그를 모르면
          영상을 다시 찍어야 하고, 그게 마감을 밀리게 하는 가장 흔한 원인이다.
          업로드는 촬영을 마친 뒤의 일이라 아래로 내린다.
        */}
        {guideUrl ? (
          <a
            href={guideUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 block rounded-xl bg-neutral-900 py-4 text-center text-base font-bold text-white"
          >
            {t("apply.done.guide_cta")}
          </a>
        ) : null}

        <div className="mt-5 rounded-xl bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">{t("apply.done.checklist_title")}</p>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-amber-900">
            <li>{t("apply.done.checklist_audio")}</li>
            <li>{t("apply.done.checklist_tags")}</li>
            <li>{t("apply.done.checklist_mention")}</li>
          </ul>
          <p className="mt-2 text-xs text-amber-800">{t("apply.done.checklist_warning")}</p>
        </div>

        <div className="mt-6 border-t border-neutral-200 pt-5">
          <p className="text-sm font-semibold text-neutral-900">{t("apply.done.after_shoot")}</p>
          <a
            href={done.submitUrl}
            className="mt-2 block rounded-xl border border-neutral-900 py-3.5 text-center text-base font-bold text-neutral-900"
          >
            {t("apply.done.upload_cta")}
          </a>
          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            {t("apply.done.link_mail")}
            <br />
            {t("apply.done.link_note")}
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
        if (channel) fd.set("channel", channel);
        setError(null);
        startTransition(async () => {
          const res = await quickApplyAction(code, fd);
          if (res.ok) setDone({ submitUrl: res.submitUrl, state: res.state });
          else setError(res.error);
        });
      }}
    >
      <Field
        name="name"
        label={t("apply.form.name")}
        placeholder={t("apply.form.name_placeholder")}
        autoComplete="name"
      />
      <Field
        name="instagram"
        label={t("apply.form.instagram")}
        placeholder="deetz.kr"
        hint={t("apply.form.instagram_hint")}
      />
      <Field
        name="email"
        label={t("apply.form.email")}
        type="email"
        placeholder="dancer@example.com"
        autoComplete="email"
        hint={t("apply.form.email_hint")}
      />
      <Field
        name="phone"
        label={t("apply.form.phone")}
        type="tel"
        placeholder="01012345678"
        autoComplete="tel"
      />

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-neutral-900 py-4 text-base font-bold text-white disabled:opacity-50"
      >
        {pending ? t("apply.form.submitting") : t("apply.form.submit")}
      </button>

      <p className="text-center text-xs text-neutral-500">
        {t("apply.form.terms_prefix")}
        <a href="/terms" className="underline">
          {t("apply.form.terms_link")}
        </a>
        {t("apply.form.terms_mid")}
        <a href="/privacy" className="underline">
          {t("apply.form.privacy_link")}
        </a>
        {t("apply.form.terms_suffix")}
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
