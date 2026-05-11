import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { CreatorToggle } from "@/components/admin/CreatorToggle";

type Row = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  can_create_project: boolean;
  is_admin: boolean;
  is_verified_badge: boolean;
  instagram_handle: string | null;
  instagram_verified_at: string | null;
  created_at: string;
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const me = await requireProfile();
  if (!me.is_admin) notFound();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select(
      "id, display_name, avatar_url, can_create_project, is_admin, is_verified_badge, instagram_handle, instagram_verified_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (q) {
    const safe = q.replace(/[%_,]/g, "");
    query = query.ilike("display_name", `%${safe}%`);
  }
  const { data } = await query;
  const list = (data ?? []) as Row[];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin"
          className="text-xs uppercase tracking-[0.14em] text-ink-3 hover:text-foreground"
        >
          ← admin 홈
        </Link>
        <h1 className="text-2xl font-bold tracking-tight leading-tight">
          사용자
        </h1>
      </header>

      <form className="flex flex-col gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="이름으로 검색 (display_name)"
          autoComplete="off"
        />
      </form>

      <ul className="flex flex-col gap-2">
        {list.map((u) => (
          <li
            key={u.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
          >
            {u.avatar_url ? (
              <Image
                src={u.avatar_url}
                alt={u.display_name}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                {u.display_name?.[0] ?? "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{u.display_name}</p>
              <p className="truncate text-[11px] text-ink-3 font-mono">
                {u.id.slice(0, 8)}…
                {u.instagram_handle ? ` · @${u.instagram_handle}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {u.is_admin ? (
                  <Tag tone="warn">admin</Tag>
                ) : null}
                {u.can_create_project ? (
                  <Tag tone="ok">creator</Tag>
                ) : null}
                {u.instagram_verified_at ? (
                  <Tag>인스타 인증</Tag>
                ) : null}
                {u.is_verified_badge ? (
                  <Tag tone="info">verified ✓</Tag>
                ) : null}
              </div>
            </div>
            {!u.is_admin ? (
              <CreatorToggle
                profileId={u.id}
                granted={u.can_create_project}
              />
            ) : (
              <span className="text-xs text-ink-3">—</span>
            )}
          </li>
        ))}
      </ul>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline-2 p-8 text-center text-sm text-ink-3">
          {q ? "검색 결과가 없습니다." : "사용자가 없습니다."}
        </p>
      ) : null}
    </div>
  );
}

function Tag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "ok" | "warn" | "info";
}) {
  const cls =
    tone === "ok"
      ? "border-ok/30 bg-ok/10 text-ok"
      : tone === "warn"
        ? "border-warn/30 bg-warn/10 text-warn"
        : tone === "info"
          ? "border-info/30 bg-info/10 text-info"
          : "border-border bg-secondary text-ink-2";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      {children}
    </span>
  );
}
