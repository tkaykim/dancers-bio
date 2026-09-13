import { HomeLanding } from "@/components/landing/HomeLanding";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { getLocale, serverT } from "@/lib/i18n/server";
import { translator, type Translator } from "@/lib/i18n/t";
import landing from "@/lib/i18n/messages/landing";
import meta from "@/lib/i18n/messages/meta";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const tMeta = translator(meta, locale);
  const t = translator(landing, locale);
  return {
    title: {
      absolute: tMeta("home.title"),
    },
    description: tMeta("home.description"),
    keywords: t("meta.keywords")
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean),
    alternates: {
      canonical: "https://deetz.kr",
    },
    openGraph: {
      title: tMeta("home.title"),
      description: t("meta.og_description"),
      url: "https://deetz.kr",
      siteName: "deetz",
      type: "website",
    },
  };
}

type Stats = {
  dancers: number | null;
  teams: number | null;
  totalProjects: number | null;
};

// 조회 실패를 600초 동안 캐시에 남기지 않으려면 캐시 안에서 throw 해야 한다
// (docs/design-i18n-ui.md §3.3). 화면용 null 폴백은 캐시 바깥에서 처리한다.
// 요청 단위 값(headers()·getLocale())은 여기서 읽지 않는다.
async function loadStatsStrict(): Promise<Stats> {
  const admin = createAdminClient();
  const [dancers, teams, projects] = await Promise.all([
    // 첫 화면 규모 어필용 카운트: 승인 대기(pending) 포함 전체를 노출하되,
    // 명시적으로 거절된(rejected) 건만 제외한다.
    admin
      .from("dancers")
      .select("id", { count: "exact", head: true })
      .neq("approval_status", "rejected"),
    admin
      .from("teams")
      .select("id", { count: "exact", head: true })
      .neq("approval_status", "rejected")
      .eq("is_active", true),
    admin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("visibility", "public")
      // Published public calls, including closed calls; never drafts or cancellations.
      .in("status", ["open", "closed"])
      .is("deleted_at", null),
  ]);
  if (dancers.error) throw dancers.error;
  if (teams.error) throw teams.error;
  if (projects.error) throw projects.error;
  return {
    dancers: dancers.count,
    teams: teams.count,
    totalProjects: projects.count,
  };
}

const cachedStats = unstable_cache(loadStatsStrict, ["landing-stats-cumulative-v1"], {
  tags: ["landing-stats"],
  revalidate: 600,
});

async function loadStats(): Promise<Stats> {
  try {
    return await cachedStats();
  } catch {
    return { dancers: null, teams: null, totalProjects: null };
  }
}

function faqList(t: Translator<typeof landing>): { question: string; answer: string }[] {
  return [
    { question: t("faq.q_service"), answer: t("faq.a_service") },
    { question: t("faq.q_booking"), answer: t("faq.a_booking") },
    { question: t("faq.q_price"), answer: t("faq.a_price") },
    { question: t("faq.q_choreography"), answer: t("faq.a_choreography") },
    { question: t("faq.q_team"), answer: t("faq.a_team") },
    { question: t("faq.q_dancer"), answer: t("faq.a_dancer") },
  ];
}

export default async function HomePage() {
  const locale = await getLocale();
  const t = await serverT(landing);
  const stats = await loadStats();
  const faqs = faqList(t);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": "https://deetz.kr/#service",
        name: t("jsonld.service_name"),
        serviceType: "Dancer booking, choreographer booking, dance team booking, and choreography production",
        provider: { "@id": "https://deetz.kr/#organization" },
        areaServed: "KR",
        url: "https://deetz.kr",
        description: t("jsonld.service_description"),
      },
      {
        "@type": "FAQPage",
        "@id": "https://deetz.kr/#faq",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomeLanding locale={locale} stats={stats} faqs={faqs} />
    </>
  );
}
