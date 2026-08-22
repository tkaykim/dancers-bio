"use client";

import { useState } from "react";
import { HandleField } from "./HandleField";
import { SubmitUploader } from "./SubmitUploader";
import { CollaboratorField } from "./CollaboratorField";
import { translator } from "@/lib/i18n/messages";
import type { Locale } from "@/lib/i18n/locale";

/**
 * 제출 화면의 상호작용 부분.
 * 핸들을 고치면 저장될 파일 이름도 함께 바뀌므로 두 컴포넌트가 같은 상태를 본다.
 */
export function SubmitPanel({
  token,
  initialHandle,
  displayName,
  alreadyUploadedName,
  initialCollaborators,
  locale,
}: {
  token: string;
  initialHandle: string;
  displayName: string | null;
  alreadyUploadedName: string | null;
  initialCollaborators: string[];
  locale: Locale;
}) {
  const t = translator(locale);
  const [handle, setHandle] = useState(initialHandle);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-border p-4 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t("submit.panel.submitter")}</span>
          <span className="font-medium">{displayName ?? handle}</span>
        </div>
        <HandleField
          token={token}
          initialHandle={initialHandle}
          onChange={setHandle}
          locale={locale}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("submit.panel.account_note")}
        </p>
      </section>

      <SubmitUploader
        token={token}
        instagramHandle={handle}
        alreadyUploadedName={alreadyUploadedName}
        locale={locale}
      />

      <CollaboratorField token={token} initial={initialCollaborators} locale={locale} />
    </div>
  );
}
