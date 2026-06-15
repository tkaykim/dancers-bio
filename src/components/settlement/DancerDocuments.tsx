"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  uploadDancerDocFromBrowser,
  type DancerDocType,
} from "@/lib/storage/dancer-document";
import {
  saveDancerDocumentPathAction,
  getDancerDocumentUrlAction,
  deleteDancerDocumentAction,
} from "@/app/actions/dancer-documents";

export type DancerDocsState = { idCard: boolean; bankbook: boolean };

const DOC_LABEL: Record<DancerDocType, string> = {
  id_card: "신분증",
  bankbook: "통장사본",
};

export function DancerDocuments({
  dancerId,
  dancerName,
  showName,
  docs,
}: {
  dancerId: string;
  dancerName: string;
  showName: boolean;
  docs: DancerDocsState;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      {showName ? (
        <span className="text-xs font-semibold text-ink-2">{dancerName}</span>
      ) : null}
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-bold">정산 서류</h3>
        <p className="text-xs text-ink-3">
          신분증과 통장사본은 정산 담당자만 열람할 수 있어요. (비공개 보관)
        </p>
      </div>
      <DocRow
        dancerId={dancerId}
        docType="id_card"
        present={docs.idCard}
      />
      <DocRow
        dancerId={dancerId}
        docType="bankbook"
        present={docs.bankbook}
      />
    </div>
  );
}

function DocRow({
  dancerId,
  docType,
  present,
}: {
  dancerId: string;
  docType: DancerDocType;
  present: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, startTransition] = useTransition();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    startTransition(async () => {
      const up = await uploadDancerDocFromBrowser(file, dancerId, docType);
      if (!up.ok) {
        toast.error(up.error);
        return;
      }
      const fd = new FormData();
      fd.set("dancer_id", dancerId);
      fd.set("doc_type", docType);
      fd.set("path", up.path);
      const res = await saveDancerDocumentPathAction(fd);
      if (res.ok) {
        toast.success(`${DOC_LABEL[docType]}을(를) 등록했어요.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function view() {
    startTransition(async () => {
      const res = await getDancerDocumentUrlAction(dancerId, docType);
      if (res.ok && res.data)
        window.open(res.data.url, "_blank", "noopener,noreferrer");
      else if (!res.ok) toast.error(res.error);
    });
  }

  function remove() {
    const fd = new FormData();
    fd.set("dancer_id", dancerId);
    fd.set("doc_type", docType);
    startTransition(async () => {
      const res = await deleteDancerDocumentAction(fd);
      if (res.ok) {
        toast.success(`${DOC_LABEL[docType]}을(를) 삭제했어요.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-hairline-2 pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{DOC_LABEL[docType]}</span>
        <span
          className={`text-xs ${present ? "text-emerald-600" : "text-ink-3"}`}
        >
          {present ? "등록됨" : "미등록"}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {present ? (
          <button
            type="button"
            onClick={view}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-2 active:bg-secondary disabled:opacity-50"
          >
            보기
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground active:opacity-80 disabled:opacity-50"
        >
          {busy ? "처리 중…" : present ? "교체" : "업로드"}
        </button>
        {present ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-red-600 active:bg-secondary disabled:opacity-50"
          >
            삭제
          </button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={onPick}
          className="hidden"
        />
      </div>
    </div>
  );
}
