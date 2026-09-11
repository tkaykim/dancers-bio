"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/provider";
import auth from "@/lib/i18n/messages/auth";

export function ChangePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();
  const t = useT(auth);

  return (
    <form
      action={(formData) => {
        setError(null);
        setOk(false);
        const pw = (formData.get("password") ?? "").toString();
        const pw2 = (formData.get("password2") ?? "").toString();
        if (pw !== pw2) {
          setError(t("error.password_mismatch"));
          return;
        }
        startTransition(async () => {
          const result = await changePasswordAction(formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setOk(true);
          router.refresh();
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("password.new")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password2">{t("password.confirm")}</Label>
        <Input
          id="password2"
          name="password2"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {t("password.changed")}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? t("password.submitting") : t("password.submit")}
      </Button>
    </form>
  );
}
