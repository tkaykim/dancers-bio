"use client";

import { useState } from "react";
import { HandleField } from "./HandleField";
import { SubmitUploader } from "./SubmitUploader";
import { CollaboratorField } from "./CollaboratorField";

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
}: {
  token: string;
  initialHandle: string;
  displayName: string | null;
  alreadyUploadedName: string | null;
  initialCollaborators: string[];
}) {
  const [handle, setHandle] = useState(initialHandle);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-xl border border-border p-4 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">제출자</span>
          <span className="font-medium">{displayName ?? handle}</span>
        </div>
        <HandleField token={token} initialHandle={initialHandle} onChange={setHandle} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          업로드한 영상이 이 계정 기준으로 정리됩니다.
          <br />
          계정이 바뀌었거나 잘못 등록되어 있으면 수정해 주세요.
        </p>
      </section>

      <SubmitUploader
        token={token}
        instagramHandle={handle}
        alreadyUploadedName={alreadyUploadedName}
      />

      <CollaboratorField token={token} initial={initialCollaborators} />
    </div>
  );
}
