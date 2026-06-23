"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { getBrowserClient } from "@/lib/supabase/browser";

const EVIDENCE_BUCKET = "fee-report-evidence";

const WORK_OPTIONS = [
  { id: "choreography", label: "안무 제작" },
  { id: "performance", label: "공연" },
  { id: "dancer_casting", label: "댄서 출연·섭외" },
  { id: "advertisement", label: "광고" },
  { id: "other", label: "기타" },
] as const;

type ClientType = "company" | "individual" | "unknown";

const MAX_FILES = 50;
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB
const ALLOWED_EXT = [
  "jpg", "jpeg", "png", "webp", "gif", "heic", "heif",
  "pdf", "doc", "docx", "hwp", "hwpx", "txt", "rtf",
  "xls", "xlsx", "csv", "ppt", "pptx", "zip", "7z", "rar", "eml", "msg",
  "mp4", "mov", "m4v", "webm", "mp3", "m4a", "wav", "aac", "amr",
];
const ACCEPT_ATTR = ALLOWED_EXT.map((e) => `.${e}`).join(",") + ",image/*";

function getExt(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}
function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const inputCls =
  "mt-2 w-full rounded-md border border-[#ddd6c7] bg-white px-3 py-2 text-sm text-[#171611] placeholder:text-[#a59e8d] focus:outline-none focus:ring-2 focus:ring-[#171611]/15";

export default function ReportPage() {
  const [workCategories, setWorkCategories] = useState<string[]>([]);
  const [otherNote, setOtherNote] = useState("");
  const [clientType, setClientType] = useState<ClientType | "">("");
  const [counterpartyNote, setCounterpartyNote] = useState("");
  const [amountNote, setAmountNote] = useState("");
  const [payTypeNote, setPayTypeNote] = useState("");
  const [facts, setFacts] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [reporterInstagram, setReporterInstagram] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  const toggleWork = (id: string) =>
    setWorkCategories((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleAddFiles = (selected: FileList | null) => {
    if (!selected) return;
    const incoming = Array.from(selected);
    setEvidenceFiles((prev) => {
      const next = [...prev];
      for (const f of incoming) {
        if (next.length >= MAX_FILES) {
          toast.error(`증빙은 최대 ${MAX_FILES}개까지 첨부할 수 있습니다.`);
          break;
        }
        if (f.size > MAX_FILE_BYTES) {
          toast.error(`「${f.name}」는 100MB를 초과합니다.`);
          continue;
        }
        if (!ALLOWED_EXT.includes(getExt(f.name))) {
          toast.error(`「${f.name}」는 지원하지 않는 형식입니다.`);
          continue;
        }
        if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
        next.push(f);
      }
      return next;
    });
  };

  const removeFile = (idx: number) => setEvidenceFiles((prev) => prev.filter((_, i) => i !== idx));

  const validateContact = (contact: string) => {
    if (!contact.trim()) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9+\-\s()]+$/;
    return emailRegex.test(contact) || phoneRegex.test(contact);
  };
  const validateInstagram = (raw: string) => {
    let s = raw.trim();
    if (s.startsWith("@")) s = s.slice(1).trim();
    if (!s) return false;
    return /^[a-zA-Z0-9._]{1,100}$/.test(s);
  };
  const buildFacts = () => {
    let text = facts.trim();
    if (workCategories.includes("other") && otherNote.trim()) {
      text = `[기타 유형]\n${otherNote.trim()}\n\n${text}`;
    }
    return text;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (workCategories.length === 0) return toast.error("해당되는 업무 유형을 하나 이상 선택해 주세요.");
    if (workCategories.includes("other") && !otherNote.trim())
      return toast.error("「기타」를 선택하셨다면 구체적으로 적어 주세요.");
    if (!clientType) return toast.error("의뢰인 구분을 선택해 주세요.");
    if (!counterpartyNote.trim() || !amountNote.trim() || !payTypeNote.trim() || !facts.trim())
      return toast.error("필수 항목을 모두 입력해 주세요.");
    if (!consent) return toast.error("아래 안내에 동의해 주세요.");
    if (!reporterName.trim()) return toast.error("제보자 이름을 입력해 주세요.");
    if (!validateContact(reporterContact))
      return toast.error("연락처는 이메일 또는 전화번호 형식으로 입력해 주세요.");
    if (!validateInstagram(reporterInstagram))
      return toast.error("인스타그램 아이디를 확인해 주세요. (@ 없이 영문·숫자·밑줄·마침표만 사용)");

    setLoading(true);
    try {
      const igNorm = reporterInstagram.trim().startsWith("@")
        ? reporterInstagram.trim().slice(1)
        : reporterInstagram.trim();
      const payload = {
        work_categories: workCategories,
        client_type: clientType,
        counterparty_note: counterpartyNote.trim(),
        amount_note: amountNote.trim(),
        pay_type_note: payTypeNote.trim(),
        facts: buildFacts(),
        reporter_name: reporterName.trim(),
        reporter_contact: reporterContact.trim(),
        reporter_instagram: igNorm,
        consent_accepted: true,
      };

      // 1) 증빙이 있으면 브라우저가 스토리지로 직접 업로드 (서명 URL → Vercel 본문 한도 우회)
      let reportId: string | undefined;
      if (evidenceFiles.length > 0) {
        setUploadProgress({ done: 0, total: evidenceFiles.length });
        const urlRes = await fetch("/api/fee-reports/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: evidenceFiles.map((f) => ({ name: f.name, size: f.size, type: f.type })),
          }),
        });
        if (!urlRes.ok) throw new Error("증빙 업로드 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        const { report_id, files } = await urlRes.json();
        reportId = report_id;
        const supabase = getBrowserClient();
        for (let i = 0; i < evidenceFiles.length; i++) {
          const target = files[i];
          const { error: upErr } = await supabase.storage
            .from(EVIDENCE_BUCKET)
            .uploadToSignedUrl(target.path, target.token, evidenceFiles[i]);
          if (upErr) {
            console.error("evidence upload:", upErr);
            throw new Error(`증빙 「${evidenceFiles[i].name}」 업로드에 실패했습니다. 다시 시도해 주세요.`);
          }
          setUploadProgress({ done: i + 1, total: evidenceFiles.length });
        }
      }

      // 2) 제보 본문 전송 (서버가 report_id 폴더의 실제 첨부를 수집해 저장)
      const dbRes = await fetch("/api/fee-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, report_id: reportId }),
      });
      if (!dbRes.ok) {
        const errJson = await dbRes.json().catch(() => ({}));
        console.error("fee-reports API:", errJson);
        throw new Error("제보 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }

      setSubmitted(true);
      toast.success("제보가 접수되었습니다. 소중한 정보에 감사드립니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="min-h-svh bg-[#f7f5ef] text-[#171611] [word-break:keep-all]">
      <div className="mx-auto max-w-2xl px-5 py-10 lg:px-8 lg:py-14">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#81796a]">REPORT</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight lg:text-4xl">
          미수·정산 제보
        </h1>
        <p className="mt-2 text-sm text-[#81796a]">
          <Link href="/" className="underline hover:text-[#171611]">홈</Link>
          {" / "}제보
        </p>

        <section className="mt-8 space-y-5 rounded-lg border border-[#ddd6c7] bg-white p-6 text-sm leading-relaxed text-[#4f4a40]">
          <p>
            최근 댄서 시장에서 프로젝트를 진행한 뒤 비용 정산이 늦어지거나 받지 못하는 사례를 여럿 접해 왔습니다.<br />
            그와 관련해 법적 절차를 진행 중인 상황도 있습니다.<br />
            개별 사건만으로는 사실관계를 넓게 파악하기 어려워, <strong className="text-[#171611]">비슷한 경험이 있는 분들의 제보</strong>를 모으고자 이 창구를 마련했습니다.
          </p>
          <p>
            <strong className="text-[#171611]">안무 제작, 공연, 댄서 출연, 광고</strong> 등으로 활동하셨으나 약정한 대금을 받지 못하셨다면, 아래 양식에 사실관계를 적고 관련 증빙을 함께 첨부해 주세요.
          </p>
          <div className="rounded-md border border-[#ddd6c7] bg-[#f7f5ef] p-4 text-xs leading-relaxed">
            접수된 내용은 사례 정리와 내부 검토의 <strong className="text-[#171611]">참고 자료</strong>로 활용합니다.<br />
            다만 본 제보가 <strong className="text-[#171611]">법률 자문이나 법적 절차의 대리를 보증하는 것은 아닙니다.</strong><br />
            수집된 자료는 추후 <strong className="text-[#171611]">단체 소송이나 청구 소송 등에 활용</strong>될 수 있습니다.<br />
            실제 활용 시에는 <strong className="text-[#171611]">반드시 제보자 본인에게 의사를 확인하고 조율한 뒤 진행</strong>합니다.
          </div>
          <div className="rounded-md border border-[#ddd6c7] bg-[#f7f5ef] p-4 text-xs leading-relaxed">
            아래에 요청하는 <strong className="text-[#171611]">이름·연락처·인스타그램 아이디</strong>는 허위 제보를 줄이고 사실관계를 내부에서만 확인하기 위해 받습니다.<br />
            해당 정보는 <strong className="text-[#171611]">웹사이트나 대외 자료에 공개되지 않으며</strong>, 제보자 개인을 드러내는 형태로 사용하지 않습니다.
          </div>
          <p className="text-xs text-[#81796a]">
            확인되지 않은 추측이나 타인의 명예를 훼손할 수 있는 표현은 삼가 주세요.<br />
            사실에 기반하여 객관적으로 적어 주시기 바랍니다.
          </p>
        </section>

        {submitted ? (
          <div className="mt-8 rounded-lg border border-[#ddd6c7] bg-white p-8 text-center">
            <p className="text-lg font-semibold text-[#171611]">제보가 접수되었습니다.</p>
            <p className="mt-3 text-sm text-[#4f4a40]">
              추가 자료나 정정이 필요하시면{" "}
              <a href="mailto:dancers.bio.kr@gmail.com" className="font-medium text-[#171611] underline">
                dancers.bio.kr@gmail.com
              </a>
              로 메일을 보내 주세요.
            </p>
            <Link
              href="/"
              className="mt-5 inline-block rounded-md bg-[#171611] px-5 py-2.5 text-sm font-semibold text-[#f7f5ef] hover:bg-[#171611]/90"
            >
              홈으로
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-7 rounded-lg border border-[#ddd6c7] bg-white p-6">
            <div>
              <label className="mb-3 block text-sm font-semibold">업무 유형 (복수 선택)</label>
              <div className="flex flex-wrap gap-3">
                {WORK_OPTIONS.map((opt) => (
                  <label key={opt.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={workCategories.includes(opt.id)}
                      onChange={() => toggleWork(opt.id)}
                      className="h-4 w-4 rounded border-[#ddd6c7]"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {workCategories.includes("other") && (
                <input
                  className={inputCls}
                  placeholder="기타 유형을 구체적으로 적어 주세요"
                  value={otherNote}
                  onChange={(e) => setOtherNote(e.target.value)}
                  maxLength={500}
                />
              )}
            </div>

            <div>
              <label className="mb-3 block text-sm font-semibold">의뢰인(클라이언트) 구분</label>
              <div className="flex flex-wrap gap-4 text-sm">
                {(
                  [
                    ["company", "회사·사업자"],
                    ["individual", "개인"],
                    ["unknown", "잘 모르겠음"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="client_type"
                      checked={clientType === value}
                      onChange={() => setClientType(value)}
                      className="h-4 w-4 border-[#ddd6c7]"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold">상대방·채권 관련 정보</label>
              <p className="mt-1 text-xs text-[#81796a]">
                업체명, 담당자 표시, 연락 경로 등 알고 계신 범위에서 적어 주세요.<br />
                정확히 모르시면 그렇게 적어 주셔도 됩니다.
              </p>
              <textarea
                required
                className={`${inputCls} min-h-[100px]`}
                value={counterpartyNote}
                onChange={(e) => setCounterpartyNote(e.target.value)}
                maxLength={4000}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold">받지 못한 금액 (대략 가능)</label>
              <input
                required
                className={inputCls}
                placeholder="예: 약 300만 원, USD 2,000 등"
                value={amountNote}
                onChange={(e) => setAmountNote(e.target.value)}
                maxLength={2000}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold">대금의 성격</label>
              <input
                required
                className={inputCls}
                placeholder="예: 출연 잔금, 안무 제작 계약 잔여, 일당 등"
                value={payTypeNote}
                onChange={(e) => setPayTypeNote(e.target.value)}
                maxLength={2000}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold">구체적인 정황·사실</label>
              <p className="mt-1 text-xs text-[#81796a]">
                계약·일정, 이행 내용, 정산 약속, 연락 시도 등 시간 순서대로 적어 주시면 이해에 도움이 됩니다.
              </p>
              <textarea
                required
                className={`${inputCls} min-h-[200px]`}
                value={facts}
                onChange={(e) => setFacts(e.target.value)}
                maxLength={12000}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold">증빙 자료 첨부 (선택)</label>
              <p className="mt-1 text-xs text-[#81796a]">
                카카오톡 대화 캡처, 이메일, 계약서, 계산서·세금계산서, 입금내역 등 관련 자료를 갯수 제한 없이 올려 주세요.<br />
                파일당 최대 100MB까지 첨부할 수 있습니다.<br />
                이미지·PDF·문서·한글·엑셀·영상·음성·zip 등을 지원합니다.
              </p>
              <input
                type="file"
                multiple
                accept={ACCEPT_ATTR}
                onChange={(e) => {
                  handleAddFiles(e.target.files);
                  e.target.value = "";
                }}
                className="mt-2 block w-full text-sm text-[#4f4a40] file:mr-4 file:rounded-md file:border-0 file:bg-[#171611] file:px-4 file:py-2 file:font-medium file:text-[#f7f5ef] hover:file:bg-[#171611]/90"
              />
              {evidenceFiles.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {evidenceFiles.map((f, idx) => (
                    <li
                      key={`${f.name}-${idx}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-[#ddd6c7] bg-[#f7f5ef] px-3 py-2 text-sm"
                    >
                      <span className="truncate">{f.name}</span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-[#81796a]">{formatBytes(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(idx)}
                          className="text-[#81796a] hover:text-[#171611]"
                          aria-label="첨부 삭제"
                        >
                          ✕
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-[#a59e8d]">
                첨부 자료는 비공개로 저장되며, 내부 확인·법적 절차 준비 용도로만 관리자가 열람합니다.
              </p>
            </div>

            <div className="space-y-4 border-t border-[#e7e1d4] pt-6">
              <div>
                <p className="text-sm font-semibold">제보자 확인 (필수)</p>
                <p className="mt-1 text-xs text-[#81796a]">허위 제보 방지를 위해 받으며, 공개되지 않습니다.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold">이름</label>
                <input
                  required
                  className={inputCls}
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  maxLength={200}
                  autoComplete="name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold">연락처 (이메일 또는 전화)</label>
                <input
                  required
                  className={inputCls}
                  value={reporterContact}
                  onChange={(e) => setReporterContact(e.target.value)}
                  maxLength={500}
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold">인스타그램 아이디</label>
                <p className="mt-1 text-xs text-[#81796a]">
                  @ 없이 입력해도 됩니다.<br />
                  공개·게시용이 아니라 내부 확인용입니다.
                </p>
                <input
                  required
                  className={inputCls}
                  placeholder="예: deetz_magazine"
                  value={reporterInstagram}
                  onChange={(e) => setReporterInstagram(e.target.value)}
                  maxLength={100}
                  autoComplete="off"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[#ddd6c7]"
              />
              <span className="text-[#4f4a40]">
                제보 내용은 사례 수집·내부 참고 목적으로만 이용되며, 기재한 이름·연락처·인스타그램은{" "}
                <strong className="text-[#171611]">외부에 공개되지 않고</strong> 허위 제보 방지·내부 확인을 위해서만 이용되는 것에 동의합니다. (필수)
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-[#171611] px-5 py-2.5 text-sm font-semibold text-[#f7f5ef] hover:bg-[#171611]/90 disabled:opacity-60 sm:w-auto"
            >
              {uploadProgress
                ? `증빙 업로드 중… (${uploadProgress.done}/${uploadProgress.total})`
                : loading
                  ? "접수 중…"
                  : "제보 보내기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
