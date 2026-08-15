"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, CircleAlert, Loader2, PartyPopper, ThumbsDown } from "lucide-react";

import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";
import { COUNTRIES } from "@/lib/data/countries";
import { submitVillageWaitlistAction } from "@/app/actions/village";
import { cn } from "@/lib/utils";
import {
  CONTACT_TYPES,
  DECLINE_REASONS,
  ROOM_PREFERENCES,
  T,
  type DeclineReason,
  type Lang,
  type PreferredOption,
  type RoomPreference,
} from "./copy";

// 국적 선택지 — 한국 국적자도 살 수는 있으므로 비자 신청과 달리 KR을 막지 않는다.
const COUNTRY_OPTIONS: SearchableOption[] = COUNTRIES.map((c) => ({
  value: c.code,
  label: c.code === "OTHER" ? c.ko : `${c.ko} (${c.en})`,
  keywords: `${c.en} ${c.ko} ${c.code}`,
}));

const OPTION_VALUES: PreferredOption[] = ["a", "b", "either", "undecided"];

/** 입주 희망 시기 선택지 — 이번 달부터 12개월. */
function nextMonths(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function VillageWaitlistForm({ lang }: { lang: Lang }) {
  const c = T[lang];

  const [interested, setInterested] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [nationality, setNationality] = useState<string | null>(null);
  const [contactType, setContactType] = useState(CONTACT_TYPES[0]);
  const [contact, setContact] = useState("");
  const [preferredOption, setPreferredOption] = useState<PreferredOption>("undecided");
  const [roomPreference, setRoomPreference] = useState<RoomPreference>("any");
  const [moveInMonth, setMoveInMonth] = useState("");
  const [message, setMessage] = useState("");
  const [declineReasons, setDeclineReasons] = useState<DeclineReason[]>([]);
  const [declineDetail, setDeclineDetail] = useState("");
  const [consent, setConsent] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"yes" | "no" | null>(null);
  const [pending, startTransition] = useTransition();

  const months = useMemo(() => nextMonths(12), []);

  const canSubmit =
    interested === true
      ? Boolean(name.trim() && nationality && contact.trim() && consent)
      : declineReasons.length > 0 || declineDetail.trim().length > 0;

  const toggleReason = (r: DeclineReason) => {
    setDeclineReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const submit = () => {
    if (interested === null || pending) return;
    setError(null);
    if (interested && !canSubmit) {
      setError(c.errRequired);
      return;
    }
    startTransition(async () => {
      const res = await submitVillageWaitlistAction({
        lang,
        interested,
        name: name.trim() || null,
        nationalityCode: nationality,
        contactType,
        contact: contact.trim() || null,
        preferredOption: interested ? preferredOption : null,
        roomPreference: interested ? roomPreference : null,
        moveInMonth: interested ? moveInMonth || null : null,
        message: message.trim() || null,
        declineReasons: interested ? [] : declineReasons,
        declineReasonDetail: interested ? null : declineDetail.trim() || null,
      });
      if (res.ok) {
        setDone(interested ? "yes" : "no");
      } else {
        setError(res.error || c.errGeneric);
      }
    });
  };

  if (done) {
    const ok = done === "yes";
    return (
      <div
        id="waitlist"
        className="scroll-mt-20 rounded-2xl border border-hairline-2 bg-card p-6 text-center md:p-8"
      >
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-secondary">
          {ok ? (
            <PartyPopper className="size-6 text-foreground" />
          ) : (
            <Check className="size-6 text-foreground" />
          )}
        </div>
        <p className="text-lg font-bold text-foreground">{ok ? c.doneTitle : c.doneDeclineTitle}</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-2">
          {ok ? c.doneBody : c.doneDeclineBody}
        </p>
        <Link
          href={`/program?lang=${lang}`}
          className="mt-5 inline-flex items-center justify-center rounded-lg border border-hairline-2 px-5 py-3 text-sm font-semibold text-foreground hover:bg-secondary"
        >
          {c.backToProgram}
        </Link>
      </div>
    );
  }

  return (
    <div id="waitlist" className="scroll-mt-20 rounded-2xl border border-hairline-2 bg-card p-5 md:p-7">
      <p className="text-lg font-bold tracking-tight text-foreground md:text-xl">{c.formTitle}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{c.formBody}</p>

      <p className="mb-2.5 mt-5 text-sm font-semibold text-foreground">{c.formQuestion}</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <ChoiceCard
          active={interested === true}
          onClick={() => {
            setInterested(true);
            setError(null);
          }}
          title={c.yes}
          hint={c.yesHint}
        />
        <ChoiceCard
          active={interested === false}
          onClick={() => {
            setInterested(false);
            setError(null);
          }}
          title={c.no}
          hint={c.noHint}
          icon={<ThumbsDown className="size-4" />}
        />
      </div>

      {interested === true ? (
        <div className="mt-6 flex flex-col gap-4">
          <Field label={c.nameLabel}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={c.namePlaceholder}
              className={inputClass}
              autoComplete="name"
            />
          </Field>

          <Field label={c.nationalityLabel}>
            <SearchableSelect
              options={COUNTRY_OPTIONS}
              value={nationality}
              onChange={setNationality}
              placeholder={c.nationalityLabel}
              searchPlaceholder={c.nationalitySearch}
              ariaLabel={c.nationalityLabel}
            />
          </Field>

          <Field label={c.contactLabel}>
            <div className="flex gap-2">
              <select
                value={contactType}
                onChange={(e) => setContactType(e.target.value)}
                aria-label={c.contactTypeLabel}
                className={cn(inputClass, "w-[38%] shrink-0")}
              >
                {CONTACT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={c.contactPlaceholder}
                className={inputClass}
              />
            </div>
          </Field>

          <Field label={c.optionLabel}>
            <div className="flex flex-col gap-2">
              {OPTION_VALUES.map((v) => (
                <RadioRow
                  key={v}
                  active={preferredOption === v}
                  onClick={() => setPreferredOption(v)}
                  label={c.optionValues[v]}
                />
              ))}
            </div>
          </Field>

          <Field label={c.roomLabel}>
            <div className="flex flex-wrap gap-2">
              {ROOM_PREFERENCES.map((r) => (
                <Chip key={r} active={roomPreference === r} onClick={() => setRoomPreference(r)}>
                  {c.roomValues[r]}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label={c.moveInLabel} optional={c.optionalTag}>
            <select
              value={moveInMonth}
              onChange={(e) => setMoveInMonth(e.target.value)}
              aria-label={c.moveInLabel}
              className={inputClass}
            >
              <option value="">—</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m.replace("-", ". ")}
                </option>
              ))}
            </select>
          </Field>

          <Field label={c.messageLabel} optional={c.optionalTag}>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={c.messagePlaceholder}
              rows={3}
              className={cn(inputClass, "resize-y")}
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
            />
            <span className="text-[13px] leading-relaxed text-ink-2">{c.consent}</span>
          </label>
        </div>
      ) : null}

      {interested === false ? (
        <div className="mt-6 flex flex-col gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{c.declineTitle}</p>
            <p className="mt-0.5 text-xs text-ink-3">{c.declineBody}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {DECLINE_REASONS.map((r) => (
                <Chip key={r} active={declineReasons.includes(r)} onClick={() => toggleReason(r)}>
                  {c.declineValues[r]}
                </Chip>
              ))}
            </div>
          </div>

          <Field label={c.declineDetailLabel} optional={c.optionalTag}>
            <textarea
              value={declineDetail}
              onChange={(e) => setDeclineDetail(e.target.value)}
              placeholder={c.declineDetailPlaceholder}
              rows={3}
              className={cn(inputClass, "resize-y")}
            />
          </Field>

          <Field label={c.declineContactLabel} optional={c.optionalTag}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={c.namePlaceholder}
              className={inputClass}
            />
          </Field>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="text-[13px] leading-relaxed text-destructive">{error}</p>
        </div>
      ) : null}

      {interested !== null ? (
        <button
          type="button"
          onClick={submit}
          disabled={pending || !canSubmit}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-45"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? c.submitting : interested ? c.submit : c.submitDecline}
        </button>
      ) : null}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-hairline-2 bg-background px-3.5 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-ink-4 focus:border-foreground/40";

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-foreground">
        {label}
        {optional ? <span className="ml-1.5 text-[11px] font-normal text-ink-4">({optional})</span> : null}
      </span>
      {children}
    </label>
  );
}

function ChoiceCard({
  active,
  onClick,
  title,
  hint,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-start gap-1 rounded-xl border px-4 py-3.5 text-left transition-colors",
        active ? "border-foreground bg-secondary/60" : "border-hairline-2 hover:border-foreground/40",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </span>
      <span className="text-xs leading-relaxed text-ink-3">{hint}</span>
    </button>
  );
}

function RadioRow({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3.5 py-3 text-left text-[13px] transition-colors",
        active ? "border-foreground bg-secondary/60 font-semibold" : "border-hairline-2 hover:border-foreground/40",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          active ? "border-foreground" : "border-hairline-2",
        )}
      >
        {active ? <span className="size-2 rounded-full bg-foreground" /> : null}
      </span>
      <span className="text-foreground">{label}</span>
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3.5 py-2 text-[13px] transition-colors",
        active
          ? "border-foreground bg-foreground text-background font-semibold"
          : "border-hairline-2 text-ink-2 hover:border-foreground/40",
      )}
    >
      {children}
    </button>
  );
}
