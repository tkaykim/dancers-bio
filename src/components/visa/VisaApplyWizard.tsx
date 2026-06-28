"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Check, Loader2, Plus, X } from "lucide-react";
import Link from "next/link";

import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { COUNTRIES } from "@/lib/data/countries";
import { KOREA_VISAS } from "@/lib/data/korea-visas";
import { submitVisaApplicationAction } from "@/app/actions/visa";
import { cn } from "@/lib/utils";

type Lang = "en" | "ja" | "ko";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
];

const MESSENGER_TYPES = [
  "Instagram",
  "KakaoTalk",
  "WhatsApp",
  "WeChat",
  "Telegram",
  "Line",
  "Facebook",
];

const COUNTRY_OPTIONS: SearchableOption[] = COUNTRIES.map((c) => ({
  value: c.code,
  label: c.code === "OTHER" ? c.ko : `${c.ko} (${c.en})`,
  keywords: `${c.en} ${c.ko} ${c.code}`,
}));

const VISA_OPTIONS: SearchableOption[] = KOREA_VISAS.map((v) => ({
  value: v.code,
  label: v.ko,
  keywords: `${v.code} ${v.en ?? ""} ${v.ko}`,
  group: v.group,
}));

// ── 다국어 문자열 ──────────────────────────────────────────────────────────
type Dict = {
  back: string;
  next: string;
  submit: string;
  search: string;
  vsearch: string;
  consent: string;
  done_title: string;
  done_body: string;
  done_extra: string;
  name_l: string;
  stage_l: string;
  same: string;
  email_l: string;
  add: string;
  mh: string;
  msgr: string;
  view_profile: string;
  submitting: string;
  err: string;
};

const T: Record<Lang, Dict> = {
  en: {
    back: "Back",
    next: "Continue",
    submit: "Submit",
    search: "Search country (English / 한글)",
    vsearch: "Search visa (e.g. E-6)",
    consent: "I agree to deetz handling my info for visa support.",
    done_title: "Got it — application received",
    done_body:
      "A deetz coordinator will reach out at the email you gave us, usually within 2–3 business days.",
    done_extra: "In the meantime, follow @deetz.kr.",
    name_l: "Full name (passport)",
    stage_l: "Stage name (optional)",
    same: "Same as my name",
    email_l: "Email (required)",
    add: "Add another contact",
    mh: "@handle or number",
    msgr: "Messenger",
    view_profile: "View your profile",
    submitting: "Submitting…",
    err: "Something went wrong. Please try again.",
  },
  ja: {
    back: "戻る",
    next: "次へ",
    submit: "送信",
    search: "国名を検索（英語／한글）",
    vsearch: "ビザを検索（例：E-6）",
    consent: "ビザ支援のための個人情報の取り扱いに同意します。",
    done_title: "申請を受け付けました",
    done_body:
      "ご記入のメールへ、deetz担当者より通常2〜3営業日以内にご連絡します。",
    done_extra: "それまで@deetz.krをフォローしてください。",
    name_l: "氏名（パスポート）",
    stage_l: "活動名（任意）",
    same: "氏名と同じ",
    email_l: "メール（必須）",
    add: "連絡先を追加",
    mh: "@ハンドル または 番号",
    msgr: "メッセンジャー",
    view_profile: "プロフィールを見る",
    submitting: "送信中…",
    err: "エラーが発生しました。もう一度お試しください。",
  },
  ko: {
    back: "이전",
    next: "다음",
    submit: "제출",
    search: "국가 검색 (영문/한글)",
    vsearch: "비자 검색 (예: E-6)",
    consent: "비자 지원을 위한 개인정보 처리에 동의합니다.",
    done_title: "신청이 접수됐어요",
    done_body:
      "deetz 담당자가 입력하신 이메일로 보통 영업일 기준 2~3일 내에 연락드립니다.",
    done_extra: "그동안 @deetz.kr 팔로우해 주세요.",
    name_l: "이름 (여권)",
    stage_l: "활동명 (선택)",
    same: "이름과 동일",
    email_l: "이메일 (필수)",
    add: "연락처 추가",
    mh: "@아이디 또는 번호",
    msgr: "메신저",
    view_profile: "내 프로필 보기",
    submitting: "제출 중…",
    err: "문제가 발생했습니다. 다시 시도해 주세요.",
  },
};

type Tri = Record<Lang, string>;
type Choice = { v: string; l: Tri };
type StepDef = {
  k: string;
  type: "country" | "names" | "contact" | "choice" | "visa" | "text" | "date" | "review";
  q: Tri;
  h?: Tri;
  ph?: string;
  cond?: [string, string];
  opts?: Choice[];
};

const STEPS: StepDef[] = [
  {
    k: "nationality",
    type: "country",
    q: { en: "Where are you from?", ja: "ご出身は？", ko: "국적이 어디인가요?" },
    h: {
      en: "Search and pick your nationality",
      ja: "国籍を検索して選択",
      ko: "국적을 검색해서 선택하세요",
    },
  },
  {
    k: "names",
    type: "names",
    q: { en: "What should we call you?", ja: "お名前を教えてください", ko: "이름을 알려주세요" },
    h: {
      en: "Your real name, and the name you dance under",
      ja: "本名と活動名",
      ko: "본명과 활동명",
    },
  },
  {
    k: "contact",
    type: "contact",
    q: { en: "How can we reach you?", ja: "連絡先を教えてください", ko: "어떻게 연락하면 될까요?" },
    h: {
      en: "Email is required. Add any messengers you use.",
      ja: "メールは必須。使っているSNSを追加できます。",
      ko: "이메일은 필수예요. 쓰는 메신저를 추가하세요.",
    },
  },
  {
    k: "hasvisa",
    type: "choice",
    q: {
      en: "Do you have a Korean visa right now?",
      ja: "今、韓国ビザをお持ちですか？",
      ko: "지금 한국 비자가 있나요?",
    },
    opts: [
      { v: "yes", l: { en: "Yes, I have one", ja: "はい、あります", ko: "네, 있어요" } },
      { v: "no", l: { en: "No / planning to apply", ja: "いいえ／申請予定", ko: "아니요 / 신청 예정" } },
    ],
  },
  {
    k: "visatype",
    type: "visa",
    cond: ["hasvisa", "yes"],
    q: { en: "Which visa do you hold?", ja: "ビザの種類は？", ko: "어떤 비자인가요?" },
  },
  {
    k: "level",
    type: "choice",
    q: {
      en: "How would you describe your dancing?",
      ja: "ご自身のダンスは？",
      ko: "본인의 춤을 어떻게 표현하시겠어요?",
    },
    opts: [
      { v: "1", l: { en: "Still need more training", ja: "もっと練習が必要", ko: "트레이닝이 더 필요해요" } },
      { v: "2", l: { en: "I've been dancing a while", ja: "ある程度踊ってきた", ko: "어느 정도 춰왔어요" } },
      { v: "3", l: { en: "Ready to work on site now", ja: "現場投入の準備OK", ko: "현장 투입 준비됐어요" } },
      { v: "4", l: { en: "Choreography & stage experience", ja: "振付・ステージ経験あり", ko: "안무·무대 경험 있어요" } },
    ],
  },
  {
    k: "video",
    type: "text",
    ph: "https://",
    q: { en: "Show us you dancing", ja: "踊っている動画を", ko: "춤추는 영상을 보여주세요" },
    h: {
      en: "Paste a YouTube / Instagram / TikTok link",
      ja: "YouTube / Instagram / TikTokのリンク",
      ko: "YouTube / Instagram / TikTok 링크",
    },
  },
  {
    k: "where",
    type: "choice",
    q: { en: "Where are you right now?", ja: "今どちらに？", ko: "지금 어디에 있나요?" },
    opts: [
      { v: "korea", l: { en: "In Korea", ja: "韓国", ko: "한국" } },
      { v: "home", l: { en: "In my home country", ja: "母国", ko: "자국" } },
    ],
  },
  {
    k: "stay",
    type: "choice",
    q: {
      en: "Do you have a place to stay in Korea?",
      ja: "韓国に滞在先はありますか？",
      ko: "한국에 거주지가 있나요?",
    },
    opts: [
      { v: "yes", l: { en: "Yes", ja: "はい", ko: "있어요" } },
      { v: "no", l: { en: "Not yet", ja: "まだ", ko: "아직 없어요" } },
    ],
  },
  {
    k: "region",
    type: "text",
    cond: ["stay", "yes"],
    ph: "Seoul",
    q: { en: "Which area?", ja: "どの地域ですか？", ko: "어느 지역인가요?" },
  },
  {
    k: "entry",
    type: "date",
    q: {
      en: "When can you enter Korea?",
      ja: "いつ入国できますか？",
      ko: "언제 한국에 입국할 수 있나요?",
    },
  },
  {
    k: "review",
    type: "review",
    q: { en: "Last step — does this look right?", ja: "最後に内容の確認を", ko: "마지막으로 확인해 주세요" },
  },
];

type Contact = { type: string; handle: string };
type Answers = {
  nationality: string;
  name: string;
  stage: string;
  email: string;
  contacts: Contact[];
  hasvisa: string;
  visatype: string;
  level: string;
  video: string;
  where: string;
  stay: string;
  region: string;
  entry: string;
};

const initialAnswers: Answers = {
  nationality: "",
  name: "",
  stage: "",
  email: "",
  contacts: [{ type: "Instagram", handle: "" }],
  hasvisa: "",
  visatype: "",
  level: "",
  video: "",
  where: "",
  stay: "",
  region: "",
  entry: "",
};

const inputClass =
  "w-full rounded-lg border border-hairline-2 bg-surface-2 px-4 py-3 text-sm text-foreground placeholder:text-ink-4 focus:border-primary focus:outline-none";

export function VisaApplyWizard({ initialLang = "en" }: { initialLang?: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [idx, setIdx] = useState(0);
  const [a, setA] = useState<Answers>(initialAnswers);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState<{ profileUrl: string | null } | null>(null);
  const [pending, startTransition] = useTransition();

  const t = T[lang];
  const active = (i: number) => {
    const s = STEPS[i];
    if (s.cond) return a[s.cond[0] as keyof Answers] === s.cond[1];
    return true;
  };

  const { visible, seen } = useMemo(() => {
    let vis = 0;
    let sn = 0;
    for (let i = 0; i < STEPS.length; i++) {
      if (active(i)) {
        vis++;
        if (i <= idx) sn++;
      }
    }
    return { visible: vis, seen: sn };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, a]);

  const go = (dir: 1 | -1) => {
    setError(null);
    let i = idx + dir;
    while (i > 0 && i < STEPS.length && !active(i)) i += dir;
    if (i < 0) i = 0;
    if (i >= STEPS.length) return;
    setIdx(i);
  };

  const setField = (k: keyof Answers, v: string) => setA((p) => ({ ...p, [k]: v }));

  const handleSubmit = () => {
    setError(null);
    startTransition(async () => {
      const res = await submitVisaApplicationAction({
        lang,
        name: a.name.trim(),
        stageName: a.stage.trim() || null,
        nationalityCode: a.nationality,
        email: a.email.trim(),
        contacts: a.contacts
          .map((c) => ({ type: c.type, handle: c.handle.trim() }))
          .filter((c) => c.handle),
        hasVisa: a.hasvisa === "yes",
        visaType: a.visatype || null,
        skillLevel: Number(a.level) || 1,
        danceVideoUrl: a.video.trim() || null,
        currentlyInKorea: a.where === "korea",
        hasResidenceInKorea: a.stay === "yes",
        residenceRegion: a.region.trim() || null,
        availableEntryDate: a.entry || null,
      });
      if (!res.ok) {
        setError(res.error || t.err);
        return;
      }
      setDone({ profileUrl: res.data?.profileUrl ?? null });
    });
  };

  if (done) {
    return (
      <Shell lang={lang} setLang={setLang} progress={100} stepLabel="">
        <div className="flex flex-1 flex-col items-center justify-center px-2 py-10 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary">
            <Check className="size-6 text-primary-foreground" />
          </div>
          <h2 className="mb-2 text-lg font-bold tracking-tight">{t.done_title}</h2>
          <p className="mb-1.5 max-w-xs text-sm leading-relaxed text-ink-2">{t.done_body}</p>
          <p className="text-xs text-ink-3">{t.done_extra}</p>
          {done.profileUrl ? (
            <a
              href={done.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 rounded-lg border border-hairline-2 px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
            >
              {t.view_profile}
            </a>
          ) : null}
        </div>
      </Shell>
    );
  }

  const s = STEPS[idx];
  const progress = visible > 0 ? Math.round((seen / visible) * 100) : 0;

  return (
    <Shell lang={lang} setLang={setLang} progress={progress} stepLabel={`${seen} / ${visible}`}>
      <div className="flex flex-1 flex-col">
        <div key={idx} className="flex-1 animate-in fade-in slide-in-from-bottom-2 pt-6 duration-200">
          <h2 className="text-xl font-bold leading-snug tracking-tight">{s.q[lang]}</h2>
          {s.h ? <p className="mt-1.5 text-sm text-ink-2">{s.h[lang]}</p> : null}

          <div className="mt-5">
            {s.type === "country" ? (
              <SearchableSelect
                options={COUNTRY_OPTIONS}
                value={a.nationality || null}
                onChange={(v) => {
                  setField("nationality", v);
                  setTimeout(() => go(1), 80);
                }}
                placeholder={t.search}
                searchPlaceholder={t.search}
                ariaLabel={t.search}
              />
            ) : null}

            {s.type === "visa" ? (
              <SearchableSelect
                options={VISA_OPTIONS}
                value={a.visatype || null}
                onChange={(v) => {
                  setField("visatype", v);
                  setTimeout(() => go(1), 80);
                }}
                placeholder={t.vsearch}
                searchPlaceholder={t.vsearch}
                ariaLabel={t.vsearch}
              />
            ) : null}

            {s.type === "names" ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-ink-2">{t.name_l}</label>
                  <input
                    className={inputClass}
                    placeholder="Mei Tanaka"
                    value={a.name}
                    onChange={(e) => setField("name", e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-ink-2">{t.stage_l}</label>
                  <input
                    className={inputClass}
                    placeholder="MEI"
                    value={a.stage}
                    onChange={(e) => setField("stage", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setField("stage", a.name)}
                    className="mt-2 rounded-full border border-hairline-2 px-3 py-1 text-xs text-ink-2 hover:bg-secondary"
                  >
                    {t.same}
                  </button>
                </div>
              </div>
            ) : null}

            {s.type === "contact" ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-ink-2">{t.email_l}</label>
                  <input
                    type="email"
                    className={inputClass}
                    placeholder="name@email.com"
                    value={a.email}
                    onChange={(e) => setField("email", e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-ink-2">{t.msgr}</label>
                  <div className="flex flex-col gap-2">
                    {a.contacts.map((c, i) => (
                      <div key={i} className="flex gap-2">
                        <select
                          className="w-32 shrink-0 rounded-lg border border-hairline-2 bg-surface-2 px-2 py-3 text-sm text-foreground focus:border-primary focus:outline-none"
                          value={c.type}
                          onChange={(e) =>
                            setA((p) => {
                              const next = [...p.contacts];
                              next[i] = { ...next[i], type: e.target.value };
                              return { ...p, contacts: next };
                            })
                          }
                        >
                          {MESSENGER_TYPES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <input
                          className={inputClass}
                          placeholder={t.mh}
                          value={c.handle}
                          onChange={(e) =>
                            setA((p) => {
                              const next = [...p.contacts];
                              next[i] = { ...next[i], handle: e.target.value };
                              return { ...p, contacts: next };
                            })
                          }
                        />
                        {a.contacts.length > 1 ? (
                          <button
                            type="button"
                            aria-label="remove"
                            onClick={() =>
                              setA((p) => ({
                                ...p,
                                contacts: p.contacts.filter((_, j) => j !== i),
                              }))
                            }
                            className="shrink-0 rounded-lg px-2 text-ink-3 hover:text-foreground"
                          >
                            <X className="size-4" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setA((p) => ({
                        ...p,
                        contacts: [...p.contacts, { type: MESSENGER_TYPES[0], handle: "" }],
                      }))
                    }
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-hairline-2 py-2.5 text-sm text-foreground hover:bg-secondary"
                  >
                    <Plus className="size-4" />
                    {t.add}
                  </button>
                </div>
              </div>
            ) : null}

            {s.type === "choice" && s.opts ? (
              <div className="flex flex-col gap-2.5">
                {s.opts.map((o) => {
                  const on = a[s.k as keyof Answers] === o.v;
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => {
                        setField(s.k as keyof Answers, o.v);
                        setTimeout(() => go(1), 120);
                      }}
                      className={cn(
                        "w-full rounded-xl border px-4 py-4 text-left text-sm transition-colors",
                        on
                          ? "border-2 border-primary font-medium"
                          : "border-hairline-2 text-foreground hover:border-foreground",
                      )}
                    >
                      {o.l[lang]}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {s.type === "text" ? (
              <input
                className={inputClass}
                placeholder={s.ph}
                value={a[s.k as keyof Answers] as string}
                onChange={(e) => setField(s.k as keyof Answers, e.target.value)}
                autoFocus
              />
            ) : null}

            {s.type === "date" ? (
              <input
                type="date"
                className={inputClass}
                value={a.entry}
                onChange={(e) => setField("entry", e.target.value)}
              />
            ) : null}

            {s.type === "review" ? (
              <>
                <ReviewCard a={a} lang={lang} />
                <label className="mt-4 flex items-start gap-2 text-sm text-ink-2">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>{t.consent}</span>
                </label>
              </>
            ) : null}
          </div>

          {error ? (
            <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={idx === 0 || pending}
            className={cn(
              "flex items-center gap-1 px-1 py-2 text-sm text-ink-2 hover:text-foreground",
              idx === 0 ? "invisible" : "",
            )}
          >
            <ArrowLeft className="size-4" />
            {t.back}
          </button>

          {needsNextButton(s.type) ? (
            <button
              type="button"
              onClick={() => (s.type === "review" ? handleSubmit() : go(1))}
              disabled={(s.type === "review" ? !consent : !canProceed(s, a)) || pending}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t.submitting}
                </>
              ) : s.type === "review" ? (
                t.submit
              ) : (
                t.next
              )}
            </button>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

function needsNextButton(type: StepDef["type"]): boolean {
  // choice / country / visa 는 선택 즉시 자동 진행 → 다음 버튼 불필요.
  return type === "names" || type === "contact" || type === "text" || type === "date" || type === "review";
}

function canProceed(s: StepDef, a: Answers): boolean {
  if (s.type === "names") return a.name.trim().length > 0;
  if (s.type === "contact") return /.+@.+\..+/.test(a.email.trim());
  return true;
}

function Shell({
  lang,
  setLang,
  progress,
  stepLabel,
  children,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  progress: number;
  stepLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-6 pb-10 pt-5">
      <div className="mb-3 flex items-center justify-between">
        <Link href="/visa" className="text-lg font-bold tracking-tight">
          deetz
        </Link>
        <div className="flex gap-1.5">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs transition-colors",
                lang === l.code
                  ? "border-foreground text-foreground"
                  : "border-hairline-2 text-ink-3 hover:text-foreground",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-1.5 h-[3px] overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      {stepLabel ? <span className="text-[11px] text-ink-3">{stepLabel}</span> : null}
      {children}
    </div>
  );
}

function ReviewCard({ a, lang }: { a: Answers; lang: Lang }) {
  const country = COUNTRIES.find((c) => c.code === a.nationality);
  const visa = KOREA_VISAS.find((v) => v.code === a.visatype);
  const levelLabel =
    STEPS.find((s) => s.k === "level")?.opts?.find((o) => o.v === a.level)?.l[lang] ?? "—";
  const whereLabel =
    STEPS.find((s) => s.k === "where")?.opts?.find((o) => o.v === a.where)?.l[lang] ?? "—";
  const visaLabel =
    a.hasvisa === "yes" ? (visa?.ko ?? "—") : a.hasvisa === "no" ? "—" : "—";
  const contactsLabel = a.contacts
    .filter((c) => c.handle.trim())
    .map((c) => `${c.type} ${c.handle.trim()}`)
    .join(", ");

  const rows: [string, string][] = [
    ["국적 / From", country ? country.ko : "—"],
    ["이름 / Name", a.name || "—"],
    ["활동명 / Stage", a.stage || "—"],
    ["이메일 / Email", a.email || "—"],
    ["비자 / Visa", visaLabel],
    ["실력 / Level", levelLabel],
    ["현재 / Now", whereLabel],
    ["입국 / Entry", a.entry || "—"],
  ];

  return (
    <div className="rounded-xl border border-hairline-2 bg-card p-4 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-hairline-2 py-1.5 last:border-0">
          <span className="shrink-0 text-ink-3">{k}</span>
          <span className="text-right text-foreground">{v}</span>
        </div>
      ))}
      {contactsLabel ? (
        <div className="flex justify-between gap-3 pt-1.5">
          <span className="shrink-0 text-ink-3">메신저</span>
          <span className="text-right text-foreground">{contactsLabel}</span>
        </div>
      ) : null}
    </div>
  );
}
