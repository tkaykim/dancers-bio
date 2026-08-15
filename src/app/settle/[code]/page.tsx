import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND_META } from "@/lib/brand";
import { getBrand } from "@/lib/brand-server";
import { getUser } from "@/lib/auth/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SettlementCollectForm,
  type CollectDancer,
} from "@/components/settlement/SettlementCollectForm";

// GRIGO 화이트라벨 호스트에서는 정산서 성격의 페이지라 검색 노출을 막고
// 탭 제목도 브랜드에 맞춘다 (루트 metadata는 deetz 고정이므로 여기서 덮음).
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  if (brand === "grigo") {
    return {
      title: { absolute: "GRIGO ENT 정산" },
      robots: { index: false, follow: false },
    };
  }
  return {};
}

// 댄서 지급정보 셀프 수집. /settle/<settlement_collect_code> (프로젝트 단위)
// 신원확인 = 로그인 세션. 안무가/팀이 단톡방·DM으로 이 링크를 배포한다.
export default async function SettlementCollectPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!code) notFound();

  const admin = createAdminClient();
  const { data: project } = await admin
    .from("projects")
    .select("id, title, settlement_collection_open")
    .eq("settlement_collect_code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();
  const open = project.settlement_collection_open === true;
  const title = (project.title as string) ?? "프로젝트";

  const brand = await getBrand();
  const brandMeta = BRAND_META[brand];

  const user = await getUser();

  // 본인 댄서 프로필 + 기존 지급정보 프리필
  let dancers: CollectDancer[] = [];
  if (user) {
    const { data: dRows } = await admin
      .from("dancers")
      .select("id, stage_name")
      .eq("profile_id", user.id);
    const list = (dRows ?? []) as Array<{
      id: string;
      stage_name: string | null;
    }>;
    if (list.length > 0) {
      const ids = list.map((d) => d.id);
      const { data: piRows } = await admin
        .from("dancer_private_info")
        .select(
          "dancer_id, bank_name, bank_account_number, bank_account_holder, resident_registration_number",
        )
        .in("dancer_id", ids);
      const piById = new Map(
        (piRows ?? []).map((p) => [p.dancer_id as string, p]),
      );
      dancers = list.map((d) => {
        const pi = piById.get(d.id);
        const account =
          pi?.bank_name && pi?.bank_account_number && pi?.bank_account_holder
            ? {
                bankName: pi.bank_name as string,
                accountNumber: pi.bank_account_number as string,
                accountHolder: pi.bank_account_holder as string,
              }
            : null;
        return {
          id: d.id,
          name: d.stage_name ?? "내 프로필",
          account,
          hasRrn: !!pi?.resident_registration_number,
        };
      });
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(`/settle/${code}`)}`;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <BrandLogo brand={brand} className="h-8 w-auto" priority />
        <h1 className="text-xl font-bold leading-tight">
          정산 정보를 입력해 주세요
        </h1>
        <p className="text-sm text-ink-2">{title}</p>
      </div>

      {!open ? (
        <p className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-ink-2">
          정산 정보 수집이 마감되었어요.
          <br />
          담당자에게 문의해 주세요.
        </p>
      ) : !user ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            {brand === "grigo"
              ? "정산 정보를 제출하려면 그리고엔터테인먼트 정산 시스템 로그인이 필요해요."
              : "정산 정보를 제출하려면 deetz 로그인이 필요해요."}
            <br />
            계좌·정산정보는 정산 담당자만 확인할 수 있게 안전하게 보관됩니다.
          </p>
          <Link
            href={loginHref}
            className="flex h-12 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground"
          >
            로그인하고 정산 정보 입력
          </Link>
          <p className="text-center text-[11px] text-ink-3">
            계정이 없으면 가입 후 바로 이어집니다.
          </p>
        </div>
      ) : dancers.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-5 text-center">
          <p className="text-sm font-semibold">
            댄서 프로필이 있어야 정산을 받을 수 있어요.
          </p>
          <Link
            href="/me/portfolio"
            className="text-xs font-semibold text-primary underline"
          >
            포트폴리오 만들기 →
          </Link>
        </div>
      ) : (
        <SettlementCollectForm
          code={code}
          projectTitle={title}
          dancers={dancers}
        />
      )}

      <p className="text-center text-[11px] text-ink-3">
        {brandMeta.name} 정산 · 원천징수 3.3% 공제 후 입금
      </p>
    </div>
  );
}
