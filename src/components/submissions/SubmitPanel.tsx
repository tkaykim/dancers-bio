"use client";

import { useState } from "react";
import { HandleField } from "./HandleField";
import { SubmitUploader } from "./SubmitUploader";

/**
 * 제출 화면의 상호작용 부분.
 * 핸들을 고치면 저장될 파일 이름도 함께 바뀌므로 두 컴포넌트가 같은 상태를 본다.
 */
export function SubmitPanel({
  token,
  initialHandle,
  displayName,
  alreadyUploadedName,
}: {
  token: string;
  initialHandle: string;
  displayName: string | null;
  alreadyUploadedName: string | null;
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

      <div className="text-xs leading-relaxed text-muted-foreground">
        <p className="font-semibold text-foreground">함께 촬영한 분이 있으신가요?</p>
        <p>영상에 다른 댄서가 함께 나오거나 인스타그램 공동 작업자로 올리실 예정이면</p>
        <p>contact@deetz.kr 로 알려주세요. 확인 후 안내드리겠습니다.</p>
      </div>
    </div>
  );
}
