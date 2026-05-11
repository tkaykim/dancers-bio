import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, bio, is_verified_badge")
    .eq("id", id)
    .single();

  if (!profile) notFound();

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 p-6 text-center">
      {profile.avatar_url ? (
        <Image
          src={profile.avatar_url}
          alt={profile.display_name ?? "프로필 사진"}
          width={120}
          height={120}
          className="h-[120px] w-[120px] rounded-full object-cover"
        />
      ) : (
        <div className="flex h-[120px] w-[120px] items-center justify-center rounded-full bg-muted text-3xl font-semibold">
          {(profile.display_name ?? "U")[0]}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">
          {profile.display_name}
          {profile.is_verified_badge ? (
            <span className="ml-2 align-middle text-sm text-blue-500" aria-label="인증된 계정">
              ✓
            </span>
          ) : null}
        </h1>
      </div>
      {profile.bio ? (
        <p className="whitespace-pre-wrap text-muted-foreground">{profile.bio}</p>
      ) : null}
    </div>
  );
}
