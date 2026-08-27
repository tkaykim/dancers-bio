"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, ChevronLeft, ChevronRight, LoaderCircle, LockKeyhole, Plus, Save, Trash2 } from "lucide-react";
import { saveVisaDocumentDraftAction, submitVisaDocumentIntakeAction } from "@/app/actions/visa-document-intake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VisaDocumentIntakeContext } from "@/lib/visa/document-intake";
import { VISA_DOCUMENT_LANGUAGES, visaDocumentCopy, type VisaDocumentLanguage } from "@/lib/visa/document-intake-copy";
import { visaDocumentSubmissionSchema, type VisaDocumentFormData } from "@/lib/visa/document-intake-schema";

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict" | "submitted";

function uid(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-foreground">
        {label}{required ? <span className="ml-1 text-destructive">*</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-ink-3">{hint}</span> : null}
    </label>
  );
}

function Choice({ checked, onChange, label, value }: { checked: boolean; onChange: () => void; label: string; value: string }) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${checked ? "border-primary bg-primary/5" : "border-border"}`}>
      <input type="radio" checked={checked} onChange={onChange} value={value} className="accent-primary" />
      {label}
    </label>
  );
}

function CheckField({ checked, onChange, children, disabled }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-2 text-sm leading-5 ${disabled ? "text-ink-3" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 accent-primary" />
      <span>{children}</span>
    </label>
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`min-h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 ${props.className ?? ""}`} />;
}

function localizedSaveError(
  result: { error: string; code?: "conflict" | "forbidden" },
  copy: ReturnType<typeof visaDocumentCopy>,
) {
  if (result.code === "conflict") return copy.conflictError;
  if (result.code === "forbidden" && result.error.includes("already accepted")) return copy.acceptedError;
  if (result.code === "forbidden") return copy.paidOnlyError;
  if (result.error.includes("Secure storage")) return copy.secureStorageError;
  if (result.error.includes("check the information")) return copy.validationError;
  return copy.draftSaveError;
}

export function VisaDocumentIntakeForm({ context, preview = false }: { context: VisaDocumentIntakeContext; preview?: boolean }) {
  const [form, setForm] = useState(context.initialData);
  const [step, setStep] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>(context.status === "submitted" ? "submitted" : "idle");
  const [message, setMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(context.lastSavedAt);
  const [pending, startTransition] = useTransition();
  const formRef = useRef(form);
  const versionRef = useRef(context.draftVersion);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const lang = form.preferredLang as VisaDocumentLanguage;
  const copy = visaDocumentCopy(lang);
  const dateLocale = lang === "ko" ? "ko-KR" : lang === "ja" ? "ja-JP" : "en-US";

  const mutate = useCallback((recipe: (current: VisaDocumentFormData) => VisaDocumentFormData) => {
    setForm((current) => {
      const next = recipe(current);
      formRef.current = next;
      dirtyRef.current = true;
      setSaveState("idle");
      setMessage("");
      return next;
    });
  }, []);

  const set = useCallback(<K extends keyof VisaDocumentFormData>(key: K, value: VisaDocumentFormData[K]) => {
    mutate((current) => ({ ...current, [key]: value }));
  }, [mutate]);

  const saveNow = useCallback(async (force = false) => {
    if ((!dirtyRef.current && !force) || saveState === "conflict") return true;
    if (savingRef.current) {
      queuedRef.current = true;
      return false;
    }
    savingRef.current = true;
    dirtyRef.current = false;
    setSaveState("saving");
    const result = preview
      ? await new Promise<Awaited<ReturnType<typeof saveVisaDocumentDraftAction>>>((resolve) => {
          window.setTimeout(() => resolve({
            ok: true,
            data: {
              version: versionRef.current + 1,
              lastSavedAt: new Date().toISOString(),
              status: "draft",
            },
          }), 120);
        })
      : await saveVisaDocumentDraftAction({
          applicationId: context.applicationId,
          expectedVersion: versionRef.current,
          data: formRef.current,
        });
    savingRef.current = false;
    if (result.ok) {
      versionRef.current = result.data.version;
      setLastSavedAt(result.data.lastSavedAt);
      setSaveState("saved");
      setMessage("");
    } else {
      dirtyRef.current = true;
      setSaveState(result.code === "conflict" ? "conflict" : "error");
      setMessage(localizedSaveError(result, copy));
    }
    if (queuedRef.current) {
      queuedRef.current = false;
    }
    return result.ok;
  }, [context.applicationId, copy, preview, saveState]);

  useEffect(() => {
    const timer = window.setTimeout(() => void saveNow(), 1200);
    return () => window.clearTimeout(timer);
  }, [form, saveNow]);

  useEffect(() => {
    const interval = window.setInterval(() => void saveNow(), 15_000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void saveNow();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current && (saveState === "error" || saveState === "conflict")) event.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [saveNow, saveState]);

  const move = async (next: number) => {
    await saveNow();
    setStep(Math.max(0, Math.min(copy.steps.length - 1, next)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    setMessage("");
    startTransition(async () => {
      if (savingRef.current) {
        setMessage(copy.submitAfterSaving);
        return;
      }
      const previewValidation = preview ? visaDocumentSubmissionSchema.safeParse(formRef.current) : null;
      const result = preview
        ? previewValidation?.success
          ? {
              ok: true as const,
              data: {
                version: versionRef.current + 1,
                lastSavedAt: new Date().toISOString(),
                status: "submitted",
              },
            }
          : {
              ok: false as const,
              error: copy.validationError,
            }
        : await submitVisaDocumentIntakeAction({
            applicationId: context.applicationId,
            expectedVersion: versionRef.current,
            data: formRef.current,
          });
      if (result.ok) {
        versionRef.current = result.data.version;
        dirtyRef.current = false;
        setLastSavedAt(result.data.lastSavedAt);
        setSaveState("submitted");
        setMessage(copy.submitSuccess);
      } else {
        setSaveState(result.code === "conflict" ? "conflict" : "error");
        setMessage(preview ? copy.validationError : localizedSaveError(result, copy));
      }
    });
  };

  const saveLabel = saveState === "saving" ? copy.saving : saveState === "saved" ? copy.saved : saveState === "submitted" ? copy.submitted : saveState === "conflict" ? copy.reloadRequired : saveState === "error" ? copy.saveFailed : copy.changesPending;
  const statusIcon = saveState === "saving" ? <LoaderCircle className="size-3.5 animate-spin" /> : saveState === "saved" || saveState === "submitted" ? <Check className="size-3.5" /> : saveState === "error" || saveState === "conflict" ? <AlertCircle className="size-3.5" /> : <Save className="size-3.5" />;

  return (
    <div lang={lang} className={lang === "ko" ? "break-keep" : undefined}>
      {!preview ? (
        <Link href="/me/visa" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-foreground">
          <ArrowLeft className="size-4" />
          {copy.backToVisa}
        </Link>
      ) : null}
      <header className="mt-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-primary">
            <LockKeyhole className="size-5" />
            <p className="text-xs font-bold uppercase tracking-[0.16em]">{copy.secureIntake}</p>
          </div>
          <div role="group" aria-label={copy.languageLabel} className="flex gap-1 rounded-lg bg-background/80 p-1">
            {VISA_DOCUMENT_LANGUAGES.map((language) => (
              <button
                key={language.value}
                type="button"
                onClick={() => set("preferredLang", language.value)}
                aria-pressed={lang === language.value}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${lang === language.value ? "border-black bg-black text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-black"}`}
              >
                {language.label}
              </button>
            ))}
          </div>
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight md:text-3xl">{copy.title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-2">{copy.intro}</p>
      </header>

      <div className="sticky top-0 z-10 mt-6 -mx-2 rounded-2xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-ink-2">{copy.stepProgress(step + 1, copy.steps.length, copy.steps[step])}</p>
          <div aria-live="polite" className={`flex items-center gap-1 text-xs ${saveState === "error" || saveState === "conflict" ? "text-destructive" : "text-ink-3"}`}>
            {statusIcon}{saveLabel}
            {lastSavedAt && saveState === "saved" ? <span className="hidden sm:inline">· {new Date(lastSavedAt).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" })}</span> : null}
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / copy.steps.length) * 100}%` }} />
        </div>
      </div>

      <form className="mt-5 rounded-3xl border border-border bg-card p-5 md:p-7" onBlur={() => void saveNow()} onSubmit={(event) => event.preventDefault()}>
        <h2 className="text-xl font-bold">{copy.steps[step]}</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {step === 0 ? <>
            <Field label={copy.fullNameEnglish} required><Input value={form.fullNameEnglish} onChange={(e) => set("fullNameEnglish", e.target.value)} autoComplete="name" /></Field>
            <Field label={copy.hanjaName} hint={copy.hanjaHint}><Input value={form.hanjaName} onChange={(e) => set("hanjaName", e.target.value)} /></Field>
            <Field label={copy.email}><Input value={context.email} disabled /></Field>
            <Field label={copy.birthDate} required><Input type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} /></Field>
            <Field label={copy.mobilePhone} required><Input value={form.mobilePhone} onChange={(e) => set("mobilePhone", e.target.value)} autoComplete="tel" /></Field>
            <div><Field label={copy.homeTelephone}><Input value={form.homePhone} disabled={form.hasNoHomePhone} onChange={(e) => set("homePhone", e.target.value)} /></Field><div className="mt-2"><CheckField checked={form.hasNoHomePhone} onChange={(value) => mutate((c) => ({ ...c, hasNoHomePhone: value, homePhone: value ? "" : c.homePhone }))}>{copy.noHomeTelephone}</CheckField></div></div>
            <div className="md:col-span-2"><Field label={copy.homeCountryAddress} required><TextArea value={form.homeCountryAddress} onChange={(e) => set("homeCountryAddress", e.target.value)} /></Field></div>
            <div className="md:col-span-2"><CheckField checked={form.currentResidenceDifferent} onChange={(value) => set("currentResidenceDifferent", value)}>{copy.currentResidenceDifferent}</CheckField></div>
            {form.currentResidenceDifferent ? <div className="md:col-span-2"><Field label={copy.currentResidenceAddress} required><TextArea value={form.currentResidenceAddress} onChange={(e) => set("currentResidenceAddress", e.target.value)} /></Field></div> : null}
            <div className="md:col-span-2"><Field label={copy.koreaPlannedAddress} required><TextArea value={form.koreaPlannedAddress} onChange={(e) => set("koreaPlannedAddress", e.target.value)} /></Field></div>
            <div className="md:col-span-2"><Field label={copy.nationalId} hint={context.primaryNationalityCode === "JP" ? copy.japanNationalIdHint : copy.nationalIdHint}><Input type="password" autoComplete="off" value={form.nationalIdNumber} disabled={context.primaryNationalityCode === "JP" || form.nationalIdNotApplicable} onChange={(e) => set("nationalIdNumber", e.target.value)} /></Field><div className="mt-2"><CheckField checked={form.nationalIdNotApplicable} disabled={context.primaryNationalityCode === "JP"} onChange={(value) => mutate((c) => ({ ...c, nationalIdNotApplicable: value, nationalIdNumber: value ? "" : c.nationalIdNumber }))}>{copy.nationalIdNotApplicable}</CheckField></div></div>
          </> : null}

          {step === 1 ? <>
            <Field label={copy.primaryNationality}><Input value={context.primaryNationalityLabel ?? context.primaryNationalityCode ?? ""} disabled /></Field>
            <div className="md:col-span-2"><p className="mb-2 text-sm font-semibold">{copy.dualNationalityQuestion}</p><div className="flex gap-2"><Choice checked={form.dualNationality} onChange={() => set("dualNationality", true)} value="yes" label={copy.yes} /><Choice checked={!form.dualNationality} onChange={() => mutate((c) => ({ ...c, dualNationality: false, dualNationalityCountries: [] }))} value="no" label={copy.no} /></div></div>
            {form.dualNationality ? <div className="md:col-span-2"><Field label={copy.otherNationalityCountries} required hint={copy.countriesCommaHint}><Input value={form.dualNationalityCountries.join(", ")} onChange={(e) => set("dualNationalityCountries", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} /></Field></div> : null}
            <Field label={copy.primaryPassportType} required><select className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm" value={form.primaryPassport.type} onChange={(e) => mutate((c) => ({ ...c, primaryPassport: { ...c.primaryPassport, type: e.target.value as VisaDocumentFormData["primaryPassport"]["type"] } }))}>{copy.passportTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
            <Field label={copy.passportNumber} required><Input type="password" autoComplete="off" value={form.primaryPassport.number} onChange={(e) => mutate((c) => ({ ...c, primaryPassport: { ...c.primaryPassport, number: e.target.value } }))} /></Field>
            <Field label={copy.passportIssuingCountry} required><Input value={form.primaryPassport.issuingCountry} onChange={(e) => mutate((c) => ({ ...c, primaryPassport: { ...c.primaryPassport, issuingCountry: e.target.value } }))} /></Field>
            <Field label={copy.passportExpiryDate} required><Input type="date" value={form.primaryPassport.expiryDate} onChange={(e) => mutate((c) => ({ ...c, primaryPassport: { ...c.primaryPassport, expiryDate: e.target.value } }))} /></Field>
            <div className="md:col-span-2"><CheckField checked={form.hasOtherPassports} onChange={(value) => mutate((c) => ({ ...c, hasOtherPassports: value, otherPassports: value ? c.otherPassports : [] }))}>{copy.hasOtherPassport}</CheckField></div>
            {form.otherPassports.map((passport, index) => <div key={passport.id} className="md:col-span-2 grid gap-3 rounded-2xl border border-border p-4 md:grid-cols-2"><Field label={copy.otherPassportType}><select className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm" value={passport.type} onChange={(e) => mutate((c) => ({ ...c, otherPassports: c.otherPassports.map((p, i) => i === index ? { ...p, type: e.target.value as typeof p.type } : p) }))}>{copy.passportTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field><Field label={copy.otherPassportNumber}><Input type="password" autoComplete="off" value={passport.number} onChange={(e) => mutate((c) => ({ ...c, otherPassports: c.otherPassports.map((p, i) => i === index ? { ...p, number: e.target.value } : p) }))} /></Field><Field label={copy.passportIssuingCountry}><Input value={passport.issuingCountry} onChange={(e) => mutate((c) => ({ ...c, otherPassports: c.otherPassports.map((p, i) => i === index ? { ...p, issuingCountry: e.target.value } : p) }))} /></Field><Field label={copy.passportExpiryDate}><Input type="date" value={passport.expiryDate} onChange={(e) => mutate((c) => ({ ...c, otherPassports: c.otherPassports.map((p, i) => i === index ? { ...p, expiryDate: e.target.value } : p) }))} /></Field><Button type="button" variant="destructive" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, otherPassports: c.otherPassports.filter((_, i) => i !== index) }))}><Trash2 />{copy.removePassport}</Button></div>)}
            {form.hasOtherPassports ? <Button type="button" variant="outline" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, otherPassports: [...c.otherPassports, { id: uid("passport"), type: "ordinary", number: "", issuingCountry: "", expiryDate: "" }] }))}><Plus />{copy.addPassport}</Button> : null}
            <div className="md:col-span-2"><CheckField checked={form.usedOtherNameInKorea} onChange={(value) => mutate((c) => ({ ...c, usedOtherNameInKorea: value, previousNames: value ? c.previousNames : [] }))}>{copy.usedOtherName}</CheckField></div>
            {form.previousNames.map((item, index) => <div key={item.id} className="md:col-span-2 flex gap-2"><Input aria-label={copy.previousNameAria} placeholder={copy.previousNamePlaceholder} value={item.fullNameEnglish} onChange={(e) => mutate((c) => ({ ...c, previousNames: c.previousNames.map((p, i) => i === index ? { ...p, fullNameEnglish: e.target.value } : p) }))} /><Button type="button" variant="destructive" size="icon" aria-label={copy.removeNameAria} onClick={() => mutate((c) => ({ ...c, previousNames: c.previousNames.filter((_, i) => i !== index) }))}><Trash2 /></Button></div>)}
            {form.usedOtherNameInKorea ? <Button type="button" variant="outline" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, previousNames: [...c.previousNames, { id: uid("name"), fullNameEnglish: "" }] }))}><Plus />{copy.addPreviousName}</Button> : null}
          </> : null}

          {step === 2 ? <>
            <p className="md:col-span-2 text-sm leading-6 text-ink-2">{copy.emergencyIntro}</p>
            <Field label={copy.nameEnglish} required><Input value={form.emergencyContact.nameEnglish} onChange={(e) => mutate((c) => ({ ...c, emergencyContact: { ...c.emergencyContact, nameEnglish: e.target.value } }))} /></Field>
            <Field label={copy.phoneNumber} required><Input value={form.emergencyContact.phone} onChange={(e) => mutate((c) => ({ ...c, emergencyContact: { ...c.emergencyContact, phone: e.target.value } }))} /></Field>
            <Field label={copy.countryOfResidence} required><Input placeholder={copy.countryExample} value={form.emergencyContact.country} onChange={(e) => mutate((c) => ({ ...c, emergencyContact: { ...c.emergencyContact, country: e.target.value } }))} /></Field>
            <Field label={copy.relationship} required><Input placeholder={copy.relationshipExample} value={form.emergencyContact.relationship} onChange={(e) => mutate((c) => ({ ...c, emergencyContact: { ...c.emergencyContact, relationship: e.target.value } }))} /></Field>
          </> : null}

          {step === 3 ? <>
            <Field label={copy.highestEducation} required><select className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm" value={form.education.level} onChange={(e) => mutate((c) => ({ ...c, education: { ...c.education, level: e.target.value as typeof c.education.level } }))}><option value="">{copy.select}</option>{copy.educationLevels.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
            <Field label={copy.schoolName} required><Input value={form.education.schoolName} onChange={(e) => mutate((c) => ({ ...c, education: { ...c.education, schoolName: e.target.value } }))} /></Field>
            <Field label={copy.city} required><Input value={form.education.city} onChange={(e) => mutate((c) => ({ ...c, education: { ...c.education, city: e.target.value } }))} /></Field>
            <Field label={copy.region}><Input value={form.education.region} onChange={(e) => mutate((c) => ({ ...c, education: { ...c.education, region: e.target.value } }))} /></Field>
            <Field label={copy.country} required><Input value={form.education.country} onChange={(e) => mutate((c) => ({ ...c, education: { ...c.education, country: e.target.value } }))} /></Field>
          </> : null}

          {step === 4 ? <>
            <div className="md:col-span-2"><p className="mb-2 text-sm font-semibold">{copy.maritalStatus}</p><div className="flex flex-wrap gap-2">{copy.maritalStatuses.map((option) => <Choice key={option.value} checked={form.maritalStatus === option.value} onChange={() => set("maritalStatus", option.value)} value={option.value} label={option.label} />)}</div></div>
            {form.maritalStatus === "married" ? <><Field label={copy.spouseName} required><Input value={form.spouse.nameEnglish} onChange={(e) => mutate((c) => ({ ...c, spouse: { ...c.spouse, nameEnglish: e.target.value } }))} /></Field><Field label={copy.spouseBirthDate} required><Input type="date" value={form.spouse.birthDate} onChange={(e) => mutate((c) => ({ ...c, spouse: { ...c.spouse, birthDate: e.target.value } }))} /></Field><Field label={copy.spouseNationality} required><Input value={form.spouse.nationality} onChange={(e) => mutate((c) => ({ ...c, spouse: { ...c.spouse, nationality: e.target.value } }))} /></Field><Field label={copy.spouseResidence} required><Input value={form.spouse.residence} onChange={(e) => mutate((c) => ({ ...c, spouse: { ...c.spouse, residence: e.target.value } }))} /></Field><Field label={copy.spousePhone} required><Input value={form.spouse.phone} onChange={(e) => mutate((c) => ({ ...c, spouse: { ...c.spouse, phone: e.target.value } }))} /></Field></> : null}
            <div><CheckField checked={form.hasChildren} onChange={(value) => mutate((c) => ({ ...c, hasChildren: value, childrenCount: value ? Math.max(1, c.childrenCount) : 0 }))}>{copy.hasChildren}</CheckField>{form.hasChildren ? <div className="mt-2"><Field label={copy.childrenCount}><Input type="number" min={1} max={20} value={form.childrenCount} onChange={(e) => set("childrenCount", Number(e.target.value))} /></Field></div> : null}</div>
            <div className="md:col-span-2"><CheckField checked={form.hasFamilyInKorea} onChange={(value) => mutate((c) => ({ ...c, hasFamilyInKorea: value, familyInKorea: value ? c.familyInKorea : [] }))}>{copy.hasFamilyInKorea}</CheckField></div>
            {form.familyInKorea.map((item,index) => <div key={item.id} className="md:col-span-2 grid gap-3 rounded-2xl border p-4 md:grid-cols-2"><Input aria-label={copy.familyNameAria} placeholder={copy.familyNamePlaceholder} value={item.nameEnglish} onChange={(e) => mutate((c) => ({ ...c, familyInKorea: c.familyInKorea.map((p,i) => i === index ? { ...p, nameEnglish: e.target.value } : p) }))} /><Input aria-label={copy.familyBirthDateAria} type="date" value={item.birthDate} onChange={(e) => mutate((c) => ({ ...c, familyInKorea: c.familyInKorea.map((p,i) => i === index ? { ...p, birthDate: e.target.value } : p) }))} /><Input aria-label={copy.familyNationalityAria} placeholder={copy.familyNationality} value={item.nationality} onChange={(e) => mutate((c) => ({ ...c, familyInKorea: c.familyInKorea.map((p,i) => i === index ? { ...p, nationality: e.target.value } : p) }))} /><Input aria-label={copy.familyRelationshipAria} placeholder={copy.familyRelationship} value={item.relationship} onChange={(e) => mutate((c) => ({ ...c, familyInKorea: c.familyInKorea.map((p,i) => i === index ? { ...p, relationship: e.target.value } : p) }))} /><Button type="button" variant="destructive" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, familyInKorea: c.familyInKorea.filter((_,i) => i !== index) }))}><Trash2 />{copy.remove}</Button></div>)}
            {form.hasFamilyInKorea ? <Button type="button" variant="outline" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, familyInKorea: [...c.familyInKorea, { id: uid("family"), nameEnglish: "", birthDate: "", nationality: "", relationship: "" }] }))}><Plus />{copy.addFamilyMember}</Button> : null}
            <div className="md:col-span-2"><CheckField checked={form.hasAccompanyingFamily} onChange={(value) => mutate((c) => ({ ...c, hasAccompanyingFamily: value, accompanyingFamily: value ? c.accompanyingFamily : [] }))}>{copy.accompanyingFamilyQuestion}</CheckField><p className="mt-1 text-xs text-ink-3">{copy.familyDefinition}</p></div>
            {form.accompanyingFamily.map((item,index) => <div key={item.id} className="md:col-span-2 flex gap-2"><Input aria-label={copy.accompanyingRelationshipAria} placeholder={copy.accompanyingRelationship} value={item.relationship} onChange={(e) => mutate((c) => ({ ...c, accompanyingFamily: c.accompanyingFamily.map((p,i) => i === index ? { ...p, relationship: e.target.value } : p) }))} /><Button type="button" variant="destructive" size="icon" aria-label={copy.remove} onClick={() => mutate((c) => ({ ...c, accompanyingFamily: c.accompanyingFamily.filter((_,i) => i !== index) }))}><Trash2 /></Button></div>)}
            {form.hasAccompanyingFamily ? <Button type="button" variant="outline" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, accompanyingFamily: [...c.accompanyingFamily, { id: uid("companion"), relationship: "" }] }))}><Plus />{copy.addAccompanyingFamily}</Button> : null}
          </> : null}

          {step === 5 ? <>
            <Field label={copy.koreaVisitCount} required><Input type="number" min={0} max={100} value={form.koreaVisitCountLast5Years} onChange={(e) => set("koreaVisitCountLast5Years", Number(e.target.value))} /></Field>
            {form.koreaVisitCountLast5Years > 0 ? <><Field label={copy.latestVisitPurpose} required><Input placeholder={copy.visitPurposeExample} value={form.latestKoreaVisit.purpose} onChange={(e) => mutate((c) => ({ ...c, latestKoreaVisit: { ...c.latestKoreaVisit, purpose: e.target.value } }))} /></Field><Field label={copy.arrivalDate} required><Input type="date" value={form.latestKoreaVisit.startDate} onChange={(e) => mutate((c) => ({ ...c, latestKoreaVisit: { ...c.latestKoreaVisit, startDate: e.target.value } }))} /></Field><Field label={copy.departureDate} required><Input type="date" value={form.latestKoreaVisit.endDate} onChange={(e) => mutate((c) => ({ ...c, latestKoreaVisit: { ...c.latestKoreaVisit, endDate: e.target.value } }))} /></Field></> : <p className="md:col-span-2 text-sm text-ink-2">{copy.noKoreaVisitDetail}</p>}
          </> : null}

          {step === 6 ? <>
            <p className="md:col-span-2 text-sm leading-6 text-ink-2">{copy.travelIntro}</p>
            {form.otherInternationalTravel.map((item,index) => <div key={item.id} className="md:col-span-2 grid gap-3 rounded-2xl border p-4 md:grid-cols-2"><Input aria-label={copy.travelCountry} placeholder={copy.travelCountryPlaceholder} value={item.country} onChange={(e) => mutate((c) => ({ ...c, otherInternationalTravel: c.otherInternationalTravel.map((p,i) => i === index ? { ...p, country: e.target.value } : p) }))} /><Input aria-label={copy.travelPurpose} placeholder={copy.travelPurposePlaceholder} value={item.purpose} onChange={(e) => mutate((c) => ({ ...c, otherInternationalTravel: c.otherInternationalTravel.map((p,i) => i === index ? { ...p, purpose: e.target.value } : p) }))} /><Field label={copy.arrivalDate}><Input type="date" value={item.startDate} onChange={(e) => mutate((c) => ({ ...c, otherInternationalTravel: c.otherInternationalTravel.map((p,i) => i === index ? { ...p, startDate: e.target.value } : p) }))} /></Field><Field label={copy.departureDate}><Input type="date" value={item.endDate} onChange={(e) => mutate((c) => ({ ...c, otherInternationalTravel: c.otherInternationalTravel.map((p,i) => i === index ? { ...p, endDate: e.target.value } : p) }))} /></Field><Button type="button" variant="destructive" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, otherInternationalTravel: c.otherInternationalTravel.filter((_,i) => i !== index) }))}><Trash2 />{copy.removeTrip}</Button></div>)}
            <Button type="button" variant="outline" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, otherInternationalTravel: [...c.otherInternationalTravel, { id: uid("travel"), country: "", purpose: "", startDate: "", endDate: "" }] }))}><Plus />{copy.addTrip}</Button>
            <div className="md:col-span-2 mt-4 space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4"><CheckField checked={form.sensitiveCollectionConsent} onChange={(value) => set("sensitiveCollectionConsent", value)}>{copy.sensitiveConsent}</CheckField><CheckField checked={form.truthfulnessConfirmed} onChange={(value) => set("truthfulnessConfirmed", value)}>{copy.truthfulnessConfirmation}</CheckField></div>
          </> : null}
        </div>

        {message ? <div role="alert" className={`mt-6 rounded-xl border px-4 py-3 text-sm leading-6 ${saveState === "submitted" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>{message}</div> : null}
        <div className="mt-7 flex items-center justify-between gap-3 border-t border-border pt-5">
          <Button type="button" variant="outline" disabled={step === 0 || pending} onClick={() => void move(step - 1)}><ChevronLeft />{copy.previous}</Button>
          {step < copy.steps.length - 1 ? <Button type="button" disabled={pending || saveState === "conflict"} onClick={() => void move(step + 1)}>{copy.saveAndContinue}<ChevronRight /></Button> : <Button type="button" disabled={pending || saveState === "conflict" || saveState === "saving"} onClick={submit}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}{copy.submitInformation}</Button>}
        </div>
      </form>
      <p className="mt-4 px-2 text-xs leading-5 text-ink-3">{copy.securityReminder}</p>
    </div>
  );
}
