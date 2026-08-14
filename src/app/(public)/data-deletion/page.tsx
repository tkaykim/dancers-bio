import type { Metadata } from "next";
import Link from "next/link";

const SITE = "https://deetz.kr";

export const metadata: Metadata = {
  title: { absolute: "데이터 삭제 요청 안내 | deetz(디츠)" },
  description:
    "deetz(디츠)에 저장된 개인정보와 Instagram 메시지 기록의 삭제를 요청하는 방법을 안내합니다.",
  alternates: { canonical: `${SITE}/data-deletion` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "데이터 삭제 요청 안내 | deetz(디츠)",
    description: "deetz(디츠) 데이터 삭제 요청 안내",
    url: `${SITE}/data-deletion`,
    siteName: "deetz",
    type: "website",
  },
};

export default function DataDeletionPage() {
  return (
    <main className="bg-[#f7f5ef] text-[#171611]">
      <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8 lg:py-16">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#81796a]">
          deetz
        </p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight [word-break:keep-all] lg:text-4xl">
          데이터 삭제 요청 안내
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-[#4f4a40] [word-break:keep-all]">
          deetz(디츠)에 저장된 회원 정보, 프로필, 문의 기록, Instagram 메시지
          기록은 언제든지 삭제를 요청하실 수 있습니다. 아래 두 가지 방법 중
          편하신 쪽을 이용해 주세요.
        </p>

        <section className="mt-10">
          <h2 className="text-lg font-bold tracking-tight lg:text-xl">
            방법 1. 회원 탈퇴로 직접 삭제
          </h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[15px] leading-7 text-[#4f4a40] [word-break:keep-all]">
            <li>deetz에 로그인합니다.</li>
            <li>내 프로필 화면으로 이동합니다.</li>
            <li>회원 탈퇴를 선택합니다.</li>
          </ol>
          <p className="mt-3 text-[15px] leading-7 text-[#4f4a40] [word-break:keep-all]">
            탈퇴하면 회원 정보와 프로필, 포트폴리오가 삭제됩니다. 다만 법령에
            따라 보관 의무가 있는 정산·거래 기록은 정해진 기간 동안 분리 보관한
            뒤 파기합니다.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold tracking-tight lg:text-xl">
            방법 2. 이메일로 삭제 요청
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-[#4f4a40] [word-break:keep-all]">
            <strong>contact@deetz.kr</strong> 로 아래 내용을 보내주시면
            확인 후 처리합니다.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[15px] leading-7 text-[#4f4a40] [word-break:keep-all]">
            <li>제목: 데이터 삭제 요청</li>
            <li>가입하신 이메일 주소 또는 Instagram 계정명</li>
            <li>삭제를 원하는 항목(계정 전체 또는 특정 기록)</li>
          </ul>
          <p className="mt-3 text-[15px] leading-7 text-[#4f4a40] [word-break:keep-all]">
            본인 확인 후 영업일 기준 7일 이내에 삭제하고, 완료 사실을 회신으로
            알려드립니다.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-bold tracking-tight lg:text-xl">
            Instagram 메시지 기록 삭제
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-[#4f4a40] [word-break:keep-all]">
            공식 계정 @deetz.kr 로 보내신 다이렉트 메시지는 문의 응대 목적으로
            저장됩니다. 해당 기록의 삭제를 원하시면 같은 Instagram 계정으로
            &ldquo;메시지 삭제 요청&rdquo;이라고 보내주시거나,
            contact@deetz.kr 로 계정명을 알려주시면 됩니다. 확인 후 발신자
            식별자와 메시지 본문을 포함한 관련 기록 전체를 지체 없이
            삭제합니다.
          </p>
        </section>

        <div className="mt-12 border-t border-[#ddd7c6] pt-6 text-sm text-[#81796a]">
          <Link href="/privacy" className="underline">
            개인정보처리방침 보기
          </Link>
          <span className="px-2">·</span>
          <Link href="/" className="underline">
            deetz 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </main>
  );
}
