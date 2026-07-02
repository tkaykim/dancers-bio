"use client";

import { cn } from "@/lib/utils";

export type SocialHandles = {
  instagram?: string;
  youtube?: string;
  tiktok?: string;
};

type Props = {
  value: SocialHandles;
  onChange: (next: SocialHandles) => void;
};

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

function TiktokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.85A8.16 8.16 0 0 0 22 10.65V7.2a4.85 4.85 0 0 1-2.41-.51z" />
    </svg>
  );
}

const FIELDS: Array<{
  key: keyof SocialHandles;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  focusClass: string;
  hint: string;
}> = [
  {
    key: "instagram",
    label: "Instagram",
    Icon: InstagramIcon,
    iconClass: "text-pink-400",
    focusClass: "focus:border-pink-400",
    hint: "instagram.com/username",
  },
  {
    key: "youtube",
    label: "YouTube",
    Icon: YoutubeIcon,
    iconClass: "text-red-500",
    focusClass: "focus:border-red-500",
    hint: "youtube.com/@channel",
  },
  {
    key: "tiktok",
    label: "TikTok",
    Icon: TiktokIcon,
    iconClass: "text-foreground",
    focusClass: "focus:border-foreground",
    hint: "tiktok.com/@username",
  },
];

// SNS 아이디에 허용되지 않는 문자(한글·공백·특수문자 등)가 있는지.
const DISALLOWED_HANDLE_CHARS = /[^A-Za-z0-9._-]/;

export function SocialLinksInput({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {FIELDS.map(({ key, label, Icon, iconClass, focusClass, hint }) => {
        const current = value[key] ?? "";
        const invalid = current.length > 0 && DISALLOWED_HANDLE_CHARS.test(current);
        return (
          <div key={key} className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm font-medium text-ink-2">
              <Icon className={cn("size-4", iconClass)} />
              {label}
            </label>
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border bg-surface-2 px-4 py-3 transition-colors",
                invalid
                  ? "border-destructive focus-within:border-destructive"
                  : "border-hairline-2 focus-within:border-primary",
              )}
            >
              <span className="shrink-0 text-sm text-ink-3">@</span>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="username"
                aria-invalid={invalid}
                className={cn(
                  "w-full bg-transparent text-sm text-foreground placeholder:text-ink-4 focus:outline-none",
                  focusClass,
                )}
                value={current}
                onChange={(e) =>
                  onChange({ ...value, [key]: e.target.value.replace(/^@/, "") })
                }
              />
            </div>
            {invalid ? (
              <p className="text-xs text-destructive">
                한글·공백·특수문자는 넣을 수 없어요. 영문 아이디만 입력해 주세요. (예: dancer_kim)
              </p>
            ) : (
              <p className="text-xs text-ink-3">{hint}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
