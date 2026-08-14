import type { Metadata } from "next";
import Link from "next/link";

const SITE = "https://deetz.kr";
const UPDATED_AT = "2026년 8월 14일";

export const metadata: Metadata = {
  title: { absolute: "서비스 이용약관 | deetz(디츠)" },
  description:
    "deetz(디츠) 서비스 이용약관입니다. 회원의 권리와 의무, 캐스팅 중개 범위, 정산, 계정 이용 제한 등을 안내합니다.",
  alternates: { canonical: `${SITE}/terms` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "서비스 이용약관 | deetz(디츠)",
    description: "deetz(디츠) 서비스 이용약관",
    url: `${SITE}/terms`,
    siteName: "deetz",
    type: "website",
  },
};

function Article({
  no,
  title,
  children,
}: {
  no: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold tracking-tight [word-break:keep-all] lg:text-xl">
        제{no}조 ({title})
      </h2>
      <div className="mt-3 space-y-2 text-[15px] leading-7 text-[#4f4a40] [word-break:keep-all]">
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="bg-[#f7f5ef] text-[#171611]">
      <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8 lg:py-16">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#81796a]">deetz</p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight [word-break:keep-all] lg:text-4xl">
          서비스 이용약관
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-[#4f4a40] [word-break:keep-all]">
          이 약관은 (주)그리고엔터테인먼트(이하 &ldquo;회사&rdquo;)가 제공하는 댄서 캐스팅
          플랫폼 deetz(디츠, {SITE}, 이하 &ldquo;서비스&rdquo;)의 이용 조건과 절차, 회사와
          이용자의 권리와 의무를 정합니다.
        </p>
        <p className="mt-2 text-sm text-[#81796a]">시행일: {UPDATED_AT}</p>

        <Article no={1} title="목적과 적용">
          <p>
            이 약관은 서비스 이용에 관한 기본 사항을 정합니다. 약관에 정하지 않은 사항은
            관계 법령과 서비스 내 개별 안내에 따릅니다.
          </p>
        </Article>

        <Article no={2} title="회원 가입과 계정">
          <ul className="list-disc space-y-1 pl-5">
            <li>이용자는 본인의 정확한 정보로 가입하며, 타인의 정보를 도용할 수 없습니다.</li>
            <li>계정과 비밀번호 관리 책임은 이용자에게 있습니다.</li>
            <li>만 14세 미만은 가입할 수 없습니다.</li>
            <li>
              미성년자는 캐스팅 지원 시 법정대리인의 동의가 필요할 수 있으며, 프로젝트에
              따라 참여가 제한될 수 있습니다.
            </li>
          </ul>
        </Article>

        <Article no={3} title="서비스의 성격과 중개 범위">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              회사는 댄서(이하 &ldquo;지원자&rdquo;)와 캐스팅을 진행하는 자(이하
              &ldquo;클라이언트&rdquo;)를 연결하는 플랫폼을 제공합니다.
            </li>
            <li>
              개별 프로젝트의 출연 조건, 일정, 보수는 원칙적으로 지원자와 클라이언트 사이에서
              정해집니다. 회사가 직접 계약 당사자가 되는 경우에는 별도로 안내합니다.
            </li>
            <li>
              회사는 클라이언트가 등록한 공고 내용의 진실성이나 프로젝트의 성사를 보증하지
              않습니다. 다만 허위·부적절한 공고를 확인한 경우 게시를 중단할 수 있습니다.
            </li>
          </ul>
        </Article>

        <Article no={4} title="콘텐츠와 권리">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              이용자가 등록한 프로필, 사진, 영상 등의 권리는 이용자에게 있습니다.
            </li>
            <li>
              이용자는 회사가 서비스 운영과 캐스팅 매칭, 서비스 홍보를 위해 등록된 프로필과
              공개 콘텐츠를 노출하는 것에 동의합니다.
            </li>
            <li>
              타인의 저작물이나 초상을 권한 없이 등록할 수 없으며, 이로 인한 분쟁의 책임은
              등록한 이용자에게 있습니다.
            </li>
          </ul>
        </Article>

        <Article no={5} title="정산">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              회사를 통해 지급되는 출연료는 프로젝트별로 안내된 조건과 일정에 따라
              정산합니다.
            </li>
            <li>
              정산에는 관계 법령에 따른 원천징수가 적용되며, 이를 위해 필요한 정보를 요청할
              수 있습니다.
            </li>
            <li>이용자가 제공한 계좌 정보 오류로 발생한 지연의 책임은 이용자에게 있습니다.</li>
          </ul>
        </Article>

        <Article no={6} title="금지 행위">
          <ul className="list-disc space-y-1 pl-5">
            <li>허위 정보 등록, 타인 사칭, 계정 양도·대여</li>
            <li>서비스를 통해 알게 된 타인의 정보를 목적 외로 이용하거나 외부에 제공하는 행위</li>
            <li>자동화된 수단으로 데이터를 수집하거나 서비스 운영을 방해하는 행위</li>
            <li>법령이나 공서양속에 반하는 내용의 게시</li>
          </ul>
        </Article>

        <Article no={7} title="이용 제한">
          <p>
            회사는 이용자가 이 약관이나 관계 법령을 위반한 경우 사전 통지 후 게시물 삭제,
            서비스 이용 제한, 계정 해지 조치를 할 수 있습니다. 긴급하거나 중대한 위반인
            경우에는 조치 후 통지할 수 있습니다.
          </p>
        </Article>

        <Article no={8} title="서비스의 변경과 중단">
          <p>
            회사는 서비스의 내용을 변경하거나 중단할 수 있으며, 이 경우 가능한 범위에서
            사전에 안내합니다. 시스템 점검이나 불가항력으로 인한 일시적 중단은 사전 안내
            없이 이루어질 수 있습니다.
          </p>
        </Article>

        <Article no={9} title="책임의 한계">
          <p>
            회사는 무료로 제공되는 서비스의 이용과 관련하여 법령에 특별한 규정이 없는 한
            책임을 지지 않습니다. 지원자와 클라이언트 사이에 발생한 분쟁에 대해서는 당사자
            간 해결을 원칙으로 하며, 회사는 필요한 범위에서 협조합니다.
          </p>
        </Article>

        <Article no={10} title="개인정보 보호">
          <p>
            개인정보의 처리에 관한 사항은{" "}
            <Link href="/privacy" className="underline">
              개인정보처리방침
            </Link>
            을 따릅니다. 데이터 삭제 요청은{" "}
            <Link href="/data-deletion" className="underline">
              데이터 삭제 요청 안내
            </Link>
            를 참고해 주세요.
          </p>
        </Article>

        <Article no={11} title="약관의 변경">
          <p>
            회사는 필요한 경우 약관을 변경할 수 있으며, 변경 시 시행일 7일 전부터 서비스
            내에 공지합니다. 이용자에게 불리한 변경은 30일 전에 공지합니다.
          </p>
        </Article>

        <Article no={12} title="문의와 준거법">
          <p>
            서비스 관련 문의는 contact@deetz.kr 로 연락해 주세요. 이 약관은 대한민국 법령에
            따라 해석하며, 분쟁은 관계 법령이 정한 절차에 따릅니다.
          </p>
          <p className="pt-2 text-sm text-[#81796a]">
            운영 주체 (주)그리고엔터테인먼트 · 사업자등록번호 116-81-96848
          </p>
        </Article>

        <div className="mt-12 border-t border-[#ddd7c6] pt-6 text-sm text-[#81796a]">
          <Link href="/privacy" className="underline">
            개인정보처리방침
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
