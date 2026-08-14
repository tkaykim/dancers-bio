"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { getBrowserClient } from "@/lib/supabase/browser";

const EVIDENCE_BUCKET = "fee-report-evidence";

const WORK_OPTIONS = [
  { id: "choreography", label: "안무 제작" },
  { id: "performance", label: "공연" },
  { id: "event", label: "행사" },
  { id: "advertisement", label: "광고" },
  { id: "other", label: "기타" },
] as const;

type ClientType = "company" | "individual" | "unknown";

const CLIENT_OPTIONS: [ClientType, string][] = [
  ["company", "회사·사업자"],
  ["individual", "개인"],
  ["unknown", "잘 모르겠음"],
];

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
  "mt-2 w-full rounded-lg border border-[#ddd6c7] bg-white px-3.5 py-2.5 text-sm text-[#171611] placeholder:text-[#a59e8d] focus:outline-none focus:ring-2 focus:ring-[#171611]/15";

// 스텝 구성: 짧게 끊어 피로 감소 (모바일 기준 한 화면 내외)
const STEPS = [
  { title: "어떤 일이었나요?", desc: "해당되는 항목만 골라 주세요." },
  { title: "금액과 상황", desc: "알고 계신 범위에서 적어 주시면 됩니다." },
  { title: "증빙 자료", desc: "선택 사항입니다." },
  { title: "제보자 확인", desc: "허위 제보 방지용이며, 외부에 공개되지 않습니다." },
] as const;

export default function ReportPage() {
  const [step, setStep] = useState(0);
  const formTopRef = useRef<HTMLDivElement | null>(null);

  const [workCategories, setWorkCategories] = useState<string[]>([]);
  const [otherNote, setOtherNote] = useState("");
  const [clientType, setClientType] = useState<ClientType | "">("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [contactPersonUnknown, setContactPersonUnknown] = useState(false);
  const [contactPersonPhone, setContactPersonPhone] = useState("");
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
          toast.error(`「${f.name}」는 100MB를 초과합니다. deetzmagazine@gmail.com으로 보내주세요.`);
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
  // 인스타그램은 선택 항목 — 비어 있으면 통과, 입력됐을 때만 형식 검증.
  const validateInstagram = (raw: string) => {
    const s = raw.trim();
    if (!s) return true;
    const clean = s.startsWith("@") ? s.slice(1).trim() : s;
    if (!clean) return true;
    return /^[a-zA-Z0-9._]{1,100}$/.test(clean);
  };
  const buildFacts = () => {
    let text = facts.trim();
    if (workCategories.includes("other") && otherNote.trim()) {
      text = `[기타 유형]\n${otherNote.trim()}\n\n${text}`;
    }
    return text;
  };
  // 상대방 구조화 정보(회사·담당자·연락처)를 counterparty_note 텍스트로 조립.
  const buildCounterpartyNote = () => {
    const lines: string[] = [];
    const nameLabel = clientType === "individual" ? "상대방 성함" : "상대방(회사) 이름";
    lines.push(`${nameLabel}: ${counterpartyName.trim()}`);
    if (clientType === "company") {
      lines.push(`담당자: ${contactPersonUnknown ? "모름" : contactPersonName.trim() || "-"}`);
      if (contactPersonPhone.trim()) lines.push(`담당자 연락처: ${contactPersonPhone.trim()}`);
    }
    return lines.join("\n");
  };

  // 스텝별 검증 — 통과 시 true
  const validateStep = (s: number): boolean => {
    if (s === 0) {
      if (workCategories.length === 0) {
        toast.error("해당되는 업무 유형을 하나 이상 선택해 주세요.");
        return false;
      }
      if (workCategories.includes("other") && !otherNote.trim()) {
        toast.error("「기타」를 선택하셨다면 구체적으로 적어 주세요.");
        return false;
      }
      if (!clientType) {
        toast.error("의뢰인 구분을 선택해 주세요.");
        return false;
      }
      if (!counterpartyName.trim()) {
        toast.error(
          clientType === "individual" ? "상대방 성함을 입력해 주세요." : "상대방(회사) 이름을 입력해 주세요.",
        );
        return false;
      }
      if (clientType === "company" && !contactPersonUnknown && !contactPersonName.trim()) {
        toast.error("담당자 이름을 입력하거나 「모름」에 체크해 주세요.");
        return false;
      }
      return true;
    }
    if (s === 1) {
      if (!amountNote.trim()) {
        toast.error("받지 못한 금액을 적어 주세요. (대략도 괜찮습니다)");
        return false;
      }
      if (!payTypeNote.trim()) {
        toast.error("대금의 성격을 적어 주세요.");
        return false;
      }
      if (!facts.trim()) {
        toast.error("구체적인 정황·사실을 적어 주세요.");
        return false;
      }
      return true;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const goPrev = () => {
    setStep((s) => Math.max(s - 1, 0));
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = async () => {
    // 최종 안전 검증 (스텝 검증과 별개로 전체 재확인)
    for (let s = 0; s <= 1; s++) if (!validateStep(s)) return setStep(s);
    if (!reporterName.trim()) return void toast.error("제보자 이름을 입력해 주세요.");
    if (!validateContact(reporterContact))
      return void toast.error("연락처는 이메일 또는 전화번호 형식으로 입력해 주세요.");
    if (!validateInstagram(reporterInstagram))
      return void toast.error("인스타그램 아이디를 확인해 주세요. (@ 없이 영문·숫자·밑줄·마침표만 사용)");
    if (!consent) return void toast.error("아래 안내에 동의해 주세요.");

    setLoading(true);
    try {
      const igRaw = reporterInstagram.trim();
      const igNorm = igRaw.startsWith("@") ? igRaw.slice(1).trim() : igRaw;
      const payload = {
        work_categories: workCategories,
        client_type: clientType,
        counterparty_note: buildCounterpartyNote(),
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

  // 선택 칩(큰 터치 타깃) 공통 스타일
  const chipCls = (active: boolean) =>
    `rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
      active
        ? "border-[#171611] bg-[#171611] text-[#f7f5ef]"
        : "border-[#ddd6c7] bg-white text-[#4f4a40] hover:border-[#b8b09c]"
    }`;

  return (
    <div className="min-h-svh bg-[#f7f5ef] text-[#171611] [word-break:keep-all]">
      <div className="mx-auto max-w-2xl px-5 py-10 lg:max-w-5xl lg:px-8 lg:py-14">
        {/* PC = 좌(소개) 우(폼) 2컬럼 / 모바일 = 세로 스택 */}
        <div className="lg:grid lg:grid-cols-[1fr_1.35fr] lg:items-start lg:gap-10">
          {/* 소개 컬럼 */}
          <div className="lg:sticky lg:top-10">
            <p className="text-xs font-semibold tracking-[0.18em] text-[#81796a]">REPORT</p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight lg:text-4xl">
              미수·정산 제보
            </h1>
            <p className="mt-2 text-sm text-[#81796a]">
              <Link href="/" className="underline hover:text-[#171611]">홈</Link>
              {" / "}제보
            </p>

            <section className="mt-6 space-y-4 rounded-xl border border-[#ddd6c7] bg-white p-6 text-sm leading-relaxed text-[#4f4a40]">
              <p>
                프로젝트를 진행한 뒤 <strong className="text-[#171611]">정산이 늦어지거나 대금을 받지 못한 사례</strong>가
                댄서 시장에서 반복되고 있습니다. 비슷한 경험이 있는 분들의 제보를 모아, 사례를 정리하고 함께
                대응하기 위한 창구입니다.
              </p>
              <p className="text-xs text-[#81796a]">
                안무 제작·공연·행사·광고 등에서 약정한 대금을 받지 못하셨다면 사실관계를 적고 증빙을 첨부해
                주세요. 확인되지 않은 추측이나 명예를 훼손할 수 있는 표현은 삼가 주시기 바랍니다.
              </p>

              <details className="group rounded-lg border border-[#e7e1d4] bg-[#f7f5ef] px-4 py-3 text-xs leading-relaxed open:pb-4">
                <summary className="cursor-pointer select-none font-semibold text-[#171611]">
                  접수 내용은 이렇게 활용됩니다
                </summary>
                <div className="mt-2 space-y-1 text-[#4f4a40]">
                  <p>접수된 내용은 사례 정리와 내부 검토의 참고 자료로 활용합니다.</p>
                  <p>본 제보가 법률 자문이나 법적 절차의 대리를 보증하는 것은 아닙니다.</p>
                  <p>수집된 자료는 추후 단체 소송이나 청구 소송 등에 활용될 수 있습니다.</p>
                  <p>실제 활용 시에는 반드시 제보자 본인에게 의사를 확인하고 조율한 뒤 진행합니다.</p>
                </div>
              </details>

              <details className="group rounded-lg border border-[#e7e1d4] bg-[#f7f5ef] px-4 py-3 text-xs leading-relaxed open:pb-4">
                <summary className="cursor-pointer select-none font-semibold text-[#171611]">
                  개인정보는 이렇게 보호됩니다
                </summary>
                <div className="mt-2 space-y-1 text-[#4f4a40]">
                  <p>이름·연락처·인스타그램 아이디는 허위 제보를 줄이고 내부 확인용으로만 받습니다.</p>
                  <p>웹사이트나 대외 자료에 공개되지 않으며, 제보자 개인을 드러내는 형태로 사용하지 않습니다.</p>
                </div>
              </details>
            </section>
          </div>

          {/* 폼 컬럼 */}
          <div ref={formTopRef} className="mt-8 scroll-mt-6 lg:mt-0">
            {submitted ? (
              <div className="rounded-xl border border-[#ddd6c7] bg-white p-8 text-center">
                <p className="text-lg font-semibold text-[#171611]">제보가 접수되었습니다.</p>
                <p className="mt-3 text-sm text-[#4f4a40]">
                  최대한 많은 자료를 모아 대응 준비를 할 예정이라, 검토와 처리까지 시일이 다소 걸릴 수 있습니다.
                </p>
                <p className="mt-2 text-sm text-[#4f4a40]">
                  추가 자료나 정정, 하고 싶은 말씀은 아래 채널로 편하게 남겨 주세요.
                </p>

                <div className="mt-6 flex items-center justify-center gap-6">
                  {/* 인스타그램 DM */}
                  <a
                    href="https://www.instagram.com/deetz.kr/"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="인스타그램 DM"
                    className="group flex flex-col items-center gap-2"
                  >
                    <span
                      className="flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-105"
                      style={{ background: "linear-gradient(45deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5)" }}
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="#fff" strokeWidth="1.9" />
                        <circle cx="12" cy="12" r="4.3" stroke="#fff" strokeWidth="1.9" />
                        <circle cx="17.4" cy="6.6" r="1.3" fill="#fff" />
                      </svg>
                    </span>
                    <span className="text-xs font-medium text-[#4f4a40]">인스타 DM</span>
                  </a>

                  {/* 카카오톡 채널 */}
                  <a
                    href="https://pf.kakao.com/_mbpXX/chat"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="카카오톡 채널로 문의"
                    className="group flex flex-col items-center gap-2"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FEE500] transition-transform group-hover:scale-105">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="#3C1E1E" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 4C6.9 4 2.8 7.3 2.8 11.3c0 2.6 1.7 4.9 4.3 6.2-.2.7-.7 2.4-.8 2.8-.1.5.2.5.4.3.2-.1 2.5-1.7 3.5-2.4.6.1 1.2.1 1.8.1 5.1 0 9.2-3.3 9.2-7.3S17.1 4 12 4z" />
                      </svg>
                    </span>
                    <span className="text-xs font-medium text-[#4f4a40]">카카오톡</span>
                  </a>

                  {/* 이메일 */}
                  <a
                    href="mailto:deetzmagazine@gmail.com"
                    aria-label="이메일 보내기"
                    className="group flex flex-col items-center gap-2"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#171611] transition-transform group-hover:scale-105">
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="3" y="5" width="18" height="14" rx="2.5" />
                        <path d="m3.5 7 8.5 6 8.5-6" />
                      </svg>
                    </span>
                    <span className="text-xs font-medium text-[#4f4a40]">이메일</span>
                  </a>
                </div>

                <p className="mt-5 text-xs text-[#8a8375]">이메일: deetzmagazine@gmail.com</p>

                <Link
                  href="/"
                  className="mt-6 inline-block rounded-md bg-[#171611] px-5 py-2.5 text-sm font-semibold text-[#f7f5ef] hover:bg-[#171611]/90"
                >
                  홈으로
                </Link>
              </div>
            ) : (
              <div className="rounded-xl border border-[#ddd6c7] bg-white p-6 lg:p-7">
                {/* 진행 표시 */}
                <div className="mb-6">
                  <div className="flex items-baseline justify-between">
                    <p className="text-base font-bold text-[#171611]">{STEPS[step].title}</p>
                    <p className="text-xs font-medium text-[#81796a]">
                      {step + 1} / {STEPS.length}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-[#81796a]">{STEPS[step].desc}</p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#efeadd]">
                    <div
                      className="h-full rounded-full bg-[#171611] transition-all duration-300"
                      style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                    />
                  </div>
                </div>

                {/* STEP 1: 업무 유형 + 의뢰인 구분 + 상대방 정보 */}
                {step === 0 && (
                  <div className="space-y-7">
                    <div>
                      <p className="mb-3 text-sm font-semibold">업무 유형 (복수 선택)</p>
                      <div className="flex flex-wrap gap-2">
                        {WORK_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            aria-pressed={workCategories.includes(opt.id)}
                            onClick={() => toggleWork(opt.id)}
                            className={chipCls(workCategories.includes(opt.id))}
                          >
                            {opt.label}
                          </button>
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
                      <p className="mb-3 text-sm font-semibold">의뢰인(클라이언트) 구분</p>
                      <div className="flex flex-wrap gap-2">
                        {CLIENT_OPTIONS.map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={clientType === value}
                            onClick={() => setClientType(value)}
                            className={chipCls(clientType === value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {clientType && (
                      <div className="space-y-4 rounded-lg border border-[#e7e1d4] bg-[#f7f5ef] p-4">
                        <div>
                          <label className="block text-sm font-semibold">
                            {clientType === "individual" ? "상대방 성함" : "상대방(회사) 이름"}
                          </label>
                          <input
                            className={inputCls}
                            placeholder={clientType === "individual" ? "예: 홍길동" : "예: ○○엔터테인먼트"}
                            value={counterpartyName}
                            onChange={(e) => setCounterpartyName(e.target.value)}
                            maxLength={200}
                          />
                        </div>

                        {clientType === "company" && (
                          <>
                            <div>
                              <label className="block text-sm font-semibold">담당자 이름</label>
                              <input
                                className={inputCls}
                                placeholder="예: 김실장"
                                value={contactPersonName}
                                disabled={contactPersonUnknown}
                                onChange={(e) => setContactPersonName(e.target.value)}
                                maxLength={100}
                              />
                              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[#4f4a40]">
                                <input
                                  type="checkbox"
                                  checked={contactPersonUnknown}
                                  onChange={(e) => {
                                    setContactPersonUnknown(e.target.checked);
                                    if (e.target.checked) setContactPersonName("");
                                  }}
                                  className="h-3.5 w-3.5 rounded border-[#ddd6c7]"
                                />
                                담당자 이름을 모릅니다
                              </label>
                            </div>

                            <div>
                              <label className="block text-sm font-semibold">
                                담당자 연락처 <span className="font-normal text-[#81796a]">(선택)</span>
                              </label>
                              <input
                                className={inputCls}
                                placeholder="예: 010-1234-5678 또는 이메일"
                                value={contactPersonPhone}
                                onChange={(e) => setContactPersonPhone(e.target.value)}
                                maxLength={200}
                              />
                              <p className="mt-1.5 text-xs text-[#81796a]">
                                바로 연락드리지 않으며, 사실관계를 파악한 뒤 실제 대응 시 제보자님께 먼저
                                알려드립니다.
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 2: 금액 + 상황(통합 서술) */}
                {step === 1 && (
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold">받지 못한 금액 (대략 가능)</label>
                      <input
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
                        계약·일정, 이행 내용, 정산 약속, 연락 시도 등 시간 순서대로 적어 주시면 이해에 도움이
                        됩니다.
                      </p>
                      <textarea
                        className={`${inputCls} min-h-[180px]`}
                        placeholder="언제 준다고 했는데 계속 밀린다, 잠적했다, 등 알고 계시는 정보를 최대한 자세히 알려주시면 큰 도움이 됩니다."
                        value={facts}
                        onChange={(e) => setFacts(e.target.value)}
                        maxLength={12000}
                      />
                    </div>
                  </div>
                )}

                {/* STEP 3: 증빙 첨부 */}
                {step === 2 && (
                  <div>
                    <label className="block text-sm font-semibold">증빙 자료 첨부 (선택)</label>
                    <p className="mt-1 text-xs text-[#81796a]">
                      카카오톡 캡처, 이메일, 계약서, 계산서, 입금내역 등을 올려 주세요. 파일당 최대 100MB,
                      이미지·PDF·문서·한글·엑셀·영상·음성·zip을 지원합니다.
                    </p>
                    <p className="mt-1 text-xs text-[#81796a]">
                      파일 용량이 커서 첨부가 어려우시면{" "}
                      <a href="mailto:deetzmagazine@gmail.com" className="underline">
                        deetzmagazine@gmail.com
                      </a>
                      으로 보내 주셔도 됩니다.
                    </p>
                    <input
                      type="file"
                      multiple
                      accept={ACCEPT_ATTR}
                      onChange={(e) => {
                        handleAddFiles(e.target.files);
                        e.target.value = "";
                      }}
                      className="mt-3 block w-full text-sm text-[#4f4a40] file:mr-4 file:rounded-md file:border-0 file:bg-[#171611] file:px-4 file:py-2 file:font-medium file:text-[#f7f5ef] hover:file:bg-[#171611]/90"
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
                )}

                {/* STEP 4: 제보자 확인 + 동의 */}
                {step === 3 && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold">이름</label>
                      <input
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
                        className={inputCls}
                        value={reporterContact}
                        onChange={(e) => setReporterContact(e.target.value)}
                        maxLength={500}
                        autoComplete="email"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold">
                        인스타그램 아이디 <span className="font-normal text-[#81796a]">(선택)</span>
                      </label>
                      <p className="mt-1 text-xs text-[#81796a]">
                        @ 없이 입력해도 됩니다. 공개·게시용이 아니라 내부 확인용입니다.
                      </p>
                      <input
                        className={inputCls}
                        placeholder="예: deetz.kr"
                        value={reporterInstagram}
                        onChange={(e) => setReporterInstagram(e.target.value)}
                        maxLength={100}
                        autoComplete="off"
                      />
                    </div>

                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e7e1d4] bg-[#f7f5ef] p-4 text-sm">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-[#ddd6c7]"
                      />
                      <span className="text-[#4f4a40]">
                        제보 내용은 사례 수집·내부 참고 목적으로만 이용되며, 기재한 이름·연락처·인스타그램은{" "}
                        <strong className="text-[#171611]">외부에 공개되지 않고</strong> 허위 제보 방지·내부 확인을
                        위해서만 이용되는 것에 동의합니다. (필수)
                      </span>
                    </label>
                  </div>
                )}

                {/* 이전 / 다음 / 제출 */}
                <div className="mt-8 flex items-center gap-3">
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={goPrev}
                      disabled={loading}
                      className="rounded-lg border border-[#ddd6c7] px-5 py-3 text-sm font-medium text-[#4f4a40] hover:border-[#b8b09c] disabled:opacity-60"
                    >
                      이전
                    </button>
                  )}
                  {step < STEPS.length - 1 ? (
                    <button
                      type="button"
                      onClick={goNext}
                      className="flex-1 rounded-lg bg-[#171611] px-5 py-3 text-sm font-semibold text-[#f7f5ef] hover:bg-[#171611]/90"
                    >
                      다음
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={loading}
                      className="flex-1 rounded-lg bg-[#171611] px-5 py-3 text-sm font-semibold text-[#f7f5ef] hover:bg-[#171611]/90 disabled:opacity-60"
                    >
                      {uploadProgress
                        ? `증빙 업로드 중… (${uploadProgress.done}/${uploadProgress.total})`
                        : loading
                          ? "접수 중…"
                          : "제보 보내기"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
