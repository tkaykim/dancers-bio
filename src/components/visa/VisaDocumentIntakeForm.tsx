"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { AlertCircle, Check, ChevronLeft, ChevronRight, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { saveVisaDocumentDraftAction, submitVisaDocumentIntakeAction } from "@/app/actions/visa-document-intake";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VisaDocumentIntakeContext } from "@/lib/visa/document-intake";
import { firstVisaDocumentIssue, visaDocumentSubmissionSchema, type VisaDocumentFormData } from "@/lib/visa/document-intake-schema";

const STEPS = [
  "Personal details",
  "Nationality & passport",
  "Emergency contact",
  "Education",
  "Family",
  "Korea visits",
  "Other travel & submit",
] as const;

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
      setMessage(result.error);
    }
    if (queuedRef.current) {
      queuedRef.current = false;
    }
    return result.ok;
  }, [context.applicationId, preview, saveState]);

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
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    setMessage("");
    startTransition(async () => {
      if (savingRef.current) {
        setMessage("Please submit again after the draft has finished saving.");
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
              error: firstVisaDocumentIssue(previewValidation!.error).message,
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
        setMessage("Your information has been submitted. Our team will contact you if anything else is needed.");
      } else {
        setSaveState(result.code === "conflict" ? "conflict" : "error");
        setMessage(result.error);
      }
    });
  };

  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "submitted" ? "Submitted" : saveState === "conflict" ? "Reload required" : saveState === "error" ? "Save failed" : "Changes pending";
  const statusIcon = saveState === "saving" ? <LoaderCircle className="size-3.5 animate-spin" /> : saveState === "saved" || saveState === "submitted" ? <Check className="size-3.5" /> : saveState === "error" || saveState === "conflict" ? <AlertCircle className="size-3.5" /> : <Save className="size-3.5" />;

  return (
    <div className="mt-6">
      <div className="sticky top-0 z-10 -mx-2 rounded-2xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-ink-2">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p>
          <div aria-live="polite" className={`flex items-center gap-1 text-xs ${saveState === "error" || saveState === "conflict" ? "text-destructive" : "text-ink-3"}`}>
            {statusIcon}{saveLabel}
            {lastSavedAt && saveState === "saved" ? <span className="hidden sm:inline">· {new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : null}
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <form className="mt-5 rounded-3xl border border-border bg-card p-5 md:p-7" onBlur={() => void saveNow()} onSubmit={(event) => event.preventDefault()}>
        <h2 className="text-xl font-bold">{STEPS[step]}</h2>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {step === 0 ? <>
            <Field label="Full name in English" required><Input value={form.fullNameEnglish} onChange={(e) => set("fullNameEnglish", e.target.value)} autoComplete="name" /></Field>
            <Field label="Name in Chinese characters (Hanja)" hint="Optional in the database, but required for applicants from countries that normally use Chinese characters, including Japan and China."><Input value={form.hanjaName} onChange={(e) => set("hanjaName", e.target.value)} /></Field>
            <Field label="Email"><Input value={context.email} disabled /></Field>
            <Field label="Date of birth" required><Input type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)} /></Field>
            <Field label="Mobile phone" required><Input value={form.mobilePhone} onChange={(e) => set("mobilePhone", e.target.value)} autoComplete="tel" /></Field>
            <div><Field label="Home telephone"><Input value={form.homePhone} disabled={form.hasNoHomePhone} onChange={(e) => set("homePhone", e.target.value)} /></Field><div className="mt-2"><CheckField checked={form.hasNoHomePhone} onChange={(value) => mutate((c) => ({ ...c, hasNoHomePhone: value, homePhone: value ? "" : c.homePhone }))}>I do not have a home telephone.</CheckField></div></div>
            <div className="md:col-span-2"><Field label="Address in home country" required><TextArea value={form.homeCountryAddress} onChange={(e) => set("homeCountryAddress", e.target.value)} /></Field></div>
            <div className="md:col-span-2"><CheckField checked={form.currentResidenceDifferent} onChange={(value) => set("currentResidenceDifferent", value)}>My current residential address is different from my home-country address.</CheckField></div>
            {form.currentResidenceDifferent ? <div className="md:col-span-2"><Field label="Current residential address" required><TextArea value={form.currentResidenceAddress} onChange={(e) => set("currentResidenceAddress", e.target.value)} /></Field></div> : null}
            <div className="md:col-span-2"><Field label="Planned address in Korea" required><TextArea value={form.koreaPlannedAddress} onChange={(e) => set("koreaPlannedAddress", e.target.value)} /></Field></div>
            <div className="md:col-span-2"><Field label="National identification number" hint={context.primaryNationalityCode === "JP" ? "Japanese My Number is not collected on this page." : "Use the resident or national identification number issued by your home country. Do not enter a Korean resident registration number."}><Input type="password" autoComplete="off" value={form.nationalIdNumber} disabled={context.primaryNationalityCode === "JP" || form.nationalIdNotApplicable} onChange={(e) => set("nationalIdNumber", e.target.value)} /></Field><div className="mt-2"><CheckField checked={form.nationalIdNotApplicable} disabled={context.primaryNationalityCode === "JP"} onChange={(value) => mutate((c) => ({ ...c, nationalIdNotApplicable: value, nationalIdNumber: value ? "" : c.nationalIdNumber }))}>Not issued / not applicable.</CheckField></div></div>
          </> : null}

          {step === 1 ? <>
            <Field label="Primary nationality"><Input value={context.primaryNationalityLabel ?? context.primaryNationalityCode ?? ""} disabled /></Field>
            <div className="md:col-span-2"><p className="mb-2 text-sm font-semibold">Do you have multiple nationalities?</p><div className="flex gap-2"><Choice checked={form.dualNationality} onChange={() => set("dualNationality", true)} value="yes" label="Yes" /><Choice checked={!form.dualNationality} onChange={() => mutate((c) => ({ ...c, dualNationality: false, dualNationalityCountries: [] }))} value="no" label="No" /></div></div>
            {form.dualNationality ? <div className="md:col-span-2"><Field label="Other nationality countries" required hint="Separate multiple countries with commas."><Input value={form.dualNationalityCountries.join(", ")} onChange={(e) => set("dualNationalityCountries", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} /></Field></div> : null}
            <Field label="Primary passport type" required><select className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm" value={form.primaryPassport.type} onChange={(e) => mutate((c) => ({ ...c, primaryPassport: { ...c.primaryPassport, type: e.target.value as VisaDocumentFormData["primaryPassport"]["type"] } }))}><option value="ordinary">Ordinary</option><option value="diplomatic">Diplomatic</option><option value="official">Official</option><option value="other">Other</option></select></Field>
            <Field label="Primary passport number" required><Input type="password" autoComplete="off" value={form.primaryPassport.number} onChange={(e) => mutate((c) => ({ ...c, primaryPassport: { ...c.primaryPassport, number: e.target.value } }))} /></Field>
            <Field label="Issuing country" required><Input value={form.primaryPassport.issuingCountry} onChange={(e) => mutate((c) => ({ ...c, primaryPassport: { ...c.primaryPassport, issuingCountry: e.target.value } }))} /></Field>
            <Field label="Expiry date" required><Input type="date" value={form.primaryPassport.expiryDate} onChange={(e) => mutate((c) => ({ ...c, primaryPassport: { ...c.primaryPassport, expiryDate: e.target.value } }))} /></Field>
            <div className="md:col-span-2"><CheckField checked={form.hasOtherPassports} onChange={(value) => mutate((c) => ({ ...c, hasOtherPassports: value, otherPassports: value ? c.otherPassports : [] }))}>I have another valid passport.</CheckField></div>
            {form.otherPassports.map((passport, index) => <div key={passport.id} className="md:col-span-2 grid gap-3 rounded-2xl border border-border p-4 md:grid-cols-2"><Field label="Passport type"><select className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm" value={passport.type} onChange={(e) => mutate((c) => ({ ...c, otherPassports: c.otherPassports.map((p, i) => i === index ? { ...p, type: e.target.value as typeof p.type } : p) }))}><option value="ordinary">Ordinary</option><option value="diplomatic">Diplomatic</option><option value="official">Official</option><option value="other">Other</option></select></Field><Field label="Passport number"><Input type="password" autoComplete="off" value={passport.number} onChange={(e) => mutate((c) => ({ ...c, otherPassports: c.otherPassports.map((p, i) => i === index ? { ...p, number: e.target.value } : p) }))} /></Field><Field label="Issuing country"><Input value={passport.issuingCountry} onChange={(e) => mutate((c) => ({ ...c, otherPassports: c.otherPassports.map((p, i) => i === index ? { ...p, issuingCountry: e.target.value } : p) }))} /></Field><Field label="Expiry date"><Input type="date" value={passport.expiryDate} onChange={(e) => mutate((c) => ({ ...c, otherPassports: c.otherPassports.map((p, i) => i === index ? { ...p, expiryDate: e.target.value } : p) }))} /></Field><Button type="button" variant="destructive" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, otherPassports: c.otherPassports.filter((_, i) => i !== index) }))}><Trash2 />Remove passport</Button></div>)}
            {form.hasOtherPassports ? <Button type="button" variant="outline" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, otherPassports: [...c.otherPassports, { id: uid("passport"), type: "ordinary", number: "", issuingCountry: "", expiryDate: "" }] }))}><Plus />Add passport</Button> : null}
            <div className="md:col-span-2"><CheckField checked={form.usedOtherNameInKorea} onChange={(value) => mutate((c) => ({ ...c, usedOtherNameInKorea: value, previousNames: value ? c.previousNames : [] }))}>I previously entered or departed Korea under a different name.</CheckField></div>
            {form.previousNames.map((item, index) => <div key={item.id} className="md:col-span-2 flex gap-2"><Input aria-label="Previous English name" placeholder="Previous full name in English" value={item.fullNameEnglish} onChange={(e) => mutate((c) => ({ ...c, previousNames: c.previousNames.map((p, i) => i === index ? { ...p, fullNameEnglish: e.target.value } : p) }))} /><Button type="button" variant="destructive" size="icon" aria-label="Remove name" onClick={() => mutate((c) => ({ ...c, previousNames: c.previousNames.filter((_, i) => i !== index) }))}><Trash2 /></Button></div>)}
            {form.usedOtherNameInKorea ? <Button type="button" variant="outline" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, previousNames: [...c.previousNames, { id: uid("name"), fullNameEnglish: "" }] }))}><Plus />Add previous name</Button> : null}
          </> : null}

          {step === 2 ? <>
            <p className="md:col-span-2 text-sm leading-6 text-ink-2">This person must be reachable while you are staying in Korea.</p>
            <Field label="Name in English" required><Input value={form.emergencyContact.nameEnglish} onChange={(e) => mutate((c) => ({ ...c, emergencyContact: { ...c.emergencyContact, nameEnglish: e.target.value } }))} /></Field>
            <Field label="Phone number" required><Input value={form.emergencyContact.phone} onChange={(e) => mutate((c) => ({ ...c, emergencyContact: { ...c.emergencyContact, phone: e.target.value } }))} /></Field>
            <Field label="Country of residence" required><Input placeholder="e.g. Korea, Japan" value={form.emergencyContact.country} onChange={(e) => mutate((c) => ({ ...c, emergencyContact: { ...c.emergencyContact, country: e.target.value } }))} /></Field>
            <Field label="Relationship" required><Input placeholder="e.g. family, friend, company" value={form.emergencyContact.relationship} onChange={(e) => mutate((c) => ({ ...c, emergencyContact: { ...c.emergencyContact, relationship: e.target.value } }))} /></Field>
          </> : null}

          {step === 3 ? <>
            <Field label="Highest education" required><select className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm" value={form.education.level} onChange={(e) => mutate((c) => ({ ...c, education: { ...c.education, level: e.target.value as typeof c.education.level } }))}><option value="">Select</option><option value="high_school">High school graduate</option><option value="bachelor">Bachelor&apos;s degree</option><option value="master">Master&apos;s degree</option><option value="doctorate">Doctorate</option></select></Field>
            <Field label="School name" required><Input value={form.education.schoolName} onChange={(e) => mutate((c) => ({ ...c, education: { ...c.education, schoolName: e.target.value } }))} /></Field>
            <Field label="City" required><Input value={form.education.city} onChange={(e) => mutate((c) => ({ ...c, education: { ...c.education, city: e.target.value } }))} /></Field>
            <Field label="State / prefecture / province"><Input value={form.education.region} onChange={(e) => mutate((c) => ({ ...c, education: { ...c.education, region: e.target.value } }))} /></Field>
            <Field label="Country" required><Input value={form.education.country} onChange={(e) => mutate((c) => ({ ...c, education: { ...c.education, country: e.target.value } }))} /></Field>
          </> : null}

          {step === 4 ? <>
            <div className="md:col-span-2"><p className="mb-2 text-sm font-semibold">Marital status</p><div className="flex flex-wrap gap-2">{([['single','Single'],['married','Married'],['divorced','Divorced']] as const).map(([value,label]) => <Choice key={value} checked={form.maritalStatus === value} onChange={() => set("maritalStatus", value)} value={value} label={label} />)}</div></div>
            {form.maritalStatus === "married" ? <><Field label="Spouse full name in English" required><Input value={form.spouse.nameEnglish} onChange={(e) => mutate((c) => ({ ...c, spouse: { ...c.spouse, nameEnglish: e.target.value } }))} /></Field><Field label="Spouse date of birth" required><Input type="date" value={form.spouse.birthDate} onChange={(e) => mutate((c) => ({ ...c, spouse: { ...c.spouse, birthDate: e.target.value } }))} /></Field><Field label="Spouse nationality" required><Input value={form.spouse.nationality} onChange={(e) => mutate((c) => ({ ...c, spouse: { ...c.spouse, nationality: e.target.value } }))} /></Field><Field label="Spouse residence" required><Input value={form.spouse.residence} onChange={(e) => mutate((c) => ({ ...c, spouse: { ...c.spouse, residence: e.target.value } }))} /></Field><Field label="Spouse phone" required><Input value={form.spouse.phone} onChange={(e) => mutate((c) => ({ ...c, spouse: { ...c.spouse, phone: e.target.value } }))} /></Field></> : null}
            <div><CheckField checked={form.hasChildren} onChange={(value) => mutate((c) => ({ ...c, hasChildren: value, childrenCount: value ? Math.max(1, c.childrenCount) : 0 }))}>I have children.</CheckField>{form.hasChildren ? <div className="mt-2"><Field label="Number of children"><Input type="number" min={1} max={20} value={form.childrenCount} onChange={(e) => set("childrenCount", Number(e.target.value))} /></Field></div> : null}</div>
            <div className="md:col-span-2"><CheckField checked={form.hasFamilyInKorea} onChange={(value) => mutate((c) => ({ ...c, hasFamilyInKorea: value, familyInKorea: value ? c.familyInKorea : [] }))}>I currently have family in Korea.</CheckField></div>
            {form.familyInKorea.map((item,index) => <div key={item.id} className="md:col-span-2 grid gap-3 rounded-2xl border p-4 md:grid-cols-2"><Input aria-label="Family name" placeholder="Full name in English" value={item.nameEnglish} onChange={(e) => mutate((c) => ({ ...c, familyInKorea: c.familyInKorea.map((p,i) => i === index ? { ...p, nameEnglish: e.target.value } : p) }))} /><Input aria-label="Family birth date" type="date" value={item.birthDate} onChange={(e) => mutate((c) => ({ ...c, familyInKorea: c.familyInKorea.map((p,i) => i === index ? { ...p, birthDate: e.target.value } : p) }))} /><Input aria-label="Family nationality" placeholder="Nationality" value={item.nationality} onChange={(e) => mutate((c) => ({ ...c, familyInKorea: c.familyInKorea.map((p,i) => i === index ? { ...p, nationality: e.target.value } : p) }))} /><Input aria-label="Family relationship" placeholder="Relationship" value={item.relationship} onChange={(e) => mutate((c) => ({ ...c, familyInKorea: c.familyInKorea.map((p,i) => i === index ? { ...p, relationship: e.target.value } : p) }))} /><Button type="button" variant="destructive" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, familyInKorea: c.familyInKorea.filter((_,i) => i !== index) }))}><Trash2 />Remove</Button></div>)}
            {form.hasFamilyInKorea ? <Button type="button" variant="outline" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, familyInKorea: [...c.familyInKorea, { id: uid("family"), nameEnglish: "", birthDate: "", nationality: "", relationship: "" }] }))}><Plus />Add family member</Button> : null}
            <div className="md:col-span-2"><CheckField checked={form.hasAccompanyingFamily} onChange={(value) => mutate((c) => ({ ...c, hasAccompanyingFamily: value, accompanyingFamily: value ? c.accompanyingFamily : [] }))}>Family will accompany me on this entry.</CheckField><p className="mt-1 text-xs text-ink-3">Family means spouse, children, parents, or siblings.</p></div>
            {form.accompanyingFamily.map((item,index) => <div key={item.id} className="md:col-span-2 flex gap-2"><Input aria-label="Accompanying relationship" placeholder="Relationship" value={item.relationship} onChange={(e) => mutate((c) => ({ ...c, accompanyingFamily: c.accompanyingFamily.map((p,i) => i === index ? { ...p, relationship: e.target.value } : p) }))} /><Button type="button" variant="destructive" size="icon" onClick={() => mutate((c) => ({ ...c, accompanyingFamily: c.accompanyingFamily.filter((_,i) => i !== index) }))}><Trash2 /></Button></div>)}
            {form.hasAccompanyingFamily ? <Button type="button" variant="outline" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, accompanyingFamily: [...c.accompanyingFamily, { id: uid("companion"), relationship: "" }] }))}><Plus />Add accompanying family member</Button> : null}
          </> : null}

          {step === 5 ? <>
            <Field label="Total visits to Korea in the last 5 years" required><Input type="number" min={0} max={100} value={form.koreaVisitCountLast5Years} onChange={(e) => set("koreaVisitCountLast5Years", Number(e.target.value))} /></Field>
            {form.koreaVisitCountLast5Years > 0 ? <><Field label="Purpose of most recent visit" required><Input placeholder="e.g. tourism, business" value={form.latestKoreaVisit.purpose} onChange={(e) => mutate((c) => ({ ...c, latestKoreaVisit: { ...c.latestKoreaVisit, purpose: e.target.value } }))} /></Field><Field label="Arrival date" required><Input type="date" value={form.latestKoreaVisit.startDate} onChange={(e) => mutate((c) => ({ ...c, latestKoreaVisit: { ...c.latestKoreaVisit, startDate: e.target.value } }))} /></Field><Field label="Departure date" required><Input type="date" value={form.latestKoreaVisit.endDate} onChange={(e) => mutate((c) => ({ ...c, latestKoreaVisit: { ...c.latestKoreaVisit, endDate: e.target.value } }))} /></Field></> : <p className="md:col-span-2 text-sm text-ink-2">No detailed Korea visit record is required when the count is zero.</p>}
          </> : null}

          {step === 6 ? <>
            <p className="md:col-span-2 text-sm leading-6 text-ink-2">List every trip outside Korea during the last five years, including exact arrival and departure dates.</p>
            {form.otherInternationalTravel.map((item,index) => <div key={item.id} className="md:col-span-2 grid gap-3 rounded-2xl border p-4 md:grid-cols-2"><Input aria-label="Travel country" placeholder="Country" value={item.country} onChange={(e) => mutate((c) => ({ ...c, otherInternationalTravel: c.otherInternationalTravel.map((p,i) => i === index ? { ...p, country: e.target.value } : p) }))} /><Input aria-label="Travel purpose" placeholder="Purpose" value={item.purpose} onChange={(e) => mutate((c) => ({ ...c, otherInternationalTravel: c.otherInternationalTravel.map((p,i) => i === index ? { ...p, purpose: e.target.value } : p) }))} /><Field label="Arrival date"><Input type="date" value={item.startDate} onChange={(e) => mutate((c) => ({ ...c, otherInternationalTravel: c.otherInternationalTravel.map((p,i) => i === index ? { ...p, startDate: e.target.value } : p) }))} /></Field><Field label="Departure date"><Input type="date" value={item.endDate} onChange={(e) => mutate((c) => ({ ...c, otherInternationalTravel: c.otherInternationalTravel.map((p,i) => i === index ? { ...p, endDate: e.target.value } : p) }))} /></Field><Button type="button" variant="destructive" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, otherInternationalTravel: c.otherInternationalTravel.filter((_,i) => i !== index) }))}><Trash2 />Remove trip</Button></div>)}
            <Button type="button" variant="outline" className="md:col-span-2" onClick={() => mutate((c) => ({ ...c, otherInternationalTravel: [...c.otherInternationalTravel, { id: uid("travel"), country: "", purpose: "", startDate: "", endDate: "" }] }))}><Plus />Add trip</Button>
            <div className="md:col-span-2 mt-4 space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4"><CheckField checked={form.sensitiveCollectionConsent} onChange={(value) => set("sensitiveCollectionConsent", value)}>I consent to deetz collecting and using the sensitive identification information entered here solely for visa-document preparation and related administration.</CheckField><CheckField checked={form.truthfulnessConfirmed} onChange={(value) => set("truthfulnessConfirmed", value)}>I confirm that the information is complete and accurate to the best of my knowledge.</CheckField></div>
          </> : null}
        </div>

        {message ? <div role="alert" className={`mt-6 rounded-xl border px-4 py-3 text-sm leading-6 ${saveState === "submitted" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>{message}</div> : null}
        <div className="mt-7 flex items-center justify-between gap-3 border-t border-border pt-5">
          <Button type="button" variant="outline" disabled={step === 0 || pending} onClick={() => void move(step - 1)}><ChevronLeft />Previous</Button>
          {step < STEPS.length - 1 ? <Button type="button" disabled={pending || saveState === "conflict"} onClick={() => void move(step + 1)}>Save &amp; continue<ChevronRight /></Button> : <Button type="button" disabled={pending || saveState === "conflict" || saveState === "saving"} onClick={submit}>{pending ? <LoaderCircle className="animate-spin" /> : <Check />}Submit information</Button>}
        </div>
      </form>
      <p className="mt-4 px-2 text-xs leading-5 text-ink-3">Do not send passport or national identification numbers by email or chat. If a save error appears, keep this tab open and retry before leaving.</p>
    </div>
  );
}
