"use client";

import { useState } from "react";
import { addPostsAction } from "@/app/actions/campaign-results";
import {
  buttonClass,
  Editor,
  ErrorText,
  inputClass,
  useAction,
} from "./Controls";
export function AddPostsDialog({ projectId }: { projectId: string }) {
  const [text, setText] = useState(""),
    [csv, setCsv] = useState(false),
    [preview, setPreview] = useState<string | null>(null);
  const action = useAction();
  return (
    <Editor title="게시물 추가">
      <label className="block">
        <input
          type="checkbox"
          checked={csv}
          onChange={(e) => {
            setCsv(e.target.checked);
            setPreview(null);
          }}
        />{" "}
        CSV 가져오기
      </label>
      {csv && (
        <>
          <p className="text-sm text-ink-3">
            열: post_url, handle, display_name, collab_handles · 공동작업 핸들은
            세미콜론으로 구분합니다.
          </p>
          <input
            aria-label="CSV 파일"
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                setText(await file.text());
                setPreview(null);
              }
            }}
          />
        </>
      )}
      <textarea
        aria-label={csv ? "CSV 내용" : "게시물 URL 여러 줄"}
        rows={6}
        className={`${inputClass} w-full`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        placeholder="URL 또는 @handle URL을 한 줄에 하나씩 입력하세요."
      />
      <button
        className={buttonClass}
        disabled={action.pending || !text.trim()}
        onClick={() =>
          action.run(
            () => addPostsAction(projectId, text, csv, true),
            (d) =>
              setPreview(
                `${d.count}개 등록 가능${d.candidates.some((c) => c.candidates.length > 1) ? " · 중복 핸들 후보는 자동 연결하지 않습니다." : ""}\n${d.candidates
                  .filter((c) => c.candidates.length > 1)
                  .map(
                    (c) =>
                      `${c.shortCode}: ${c.candidates.map((v) => v.name).join(", ")}`,
                  )
                  .join("\n")}`,
              ),
          )
        }
      >
        중복·연결 확인
      </button>
      {preview && (
        <>
          <p className="whitespace-pre-line">{preview}</p>
          <button
            className={buttonClass}
            disabled={action.pending}
            onClick={() =>
              action.run(
                () => addPostsAction(projectId, text, csv),
                () => {
                  setText("");
                  setPreview(null);
                },
              )
            }
          >
            게시물 저장
          </button>
        </>
      )}
      <ErrorText error={action.error} />
    </Editor>
  );
}
