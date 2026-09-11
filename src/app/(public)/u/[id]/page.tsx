import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { serverT } from "@/lib/i18n/server";
import profile from "@/lib/i18n/messages/profile";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await serverT(profile);
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, bio, is_verified_badge")
    .eq("id", id)
    .single();

  if (!row) notFound();

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 p-6 text-center">
      {row.avatar_url ? (
        <Image
          src={row.avatar_url}
          alt={row.display_name ?? t("user.avatar_alt")}
          width={120}
          height={120}
          className="h-[120px] w-[120px] rounded-full object-cover"
        />
      ) : (
        <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full bg-muted text-3xl font-semibold">
          {(row.display_name ?? "U")[0]}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold" data-ugc>
          {row.display_name}
          {row.is_verified_badge ? (
            <span
              className="ml-2 align-middle text-sm text-blue-500"
              aria-label={t("user.verified")}
            >
              ✓
            </span>
          ) : null}
        </h1>
      </div>
      {row.bio ? (
        <p className="whitespace-pre-wrap text-muted-foreground" data-ugc>
          {row.bio}
        </p>
      ) : null}
    </div>
  );
}
