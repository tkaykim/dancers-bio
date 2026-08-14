import type { Metadata } from "next";
import Link from "next/link";

const SITE = "https://deetz.kr";
const UPDATED_AT = "2026년 8월 14일";

export const metadata: Metadata = {
  title: { absolute: "개인정보처리방침 | deetz(디츠)" },
  description:
    "deetz(디츠)가 수집하는 개인정보의 항목, 이용 목적, 보유 기간, 처리위탁, 정보주체의 권리와 행사 방법을 안내합니다.",
  alternates: { canonical: `${SITE}/privacy` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "개인정보처리방침 | deetz(디츠)",
    description: "deetz(디츠) 개인정보처리방침",
    url: `${SITE}/privacy`,
    siteName: "deetz",
    type: "website",
  },
};

function Section({
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
        {no}. {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-[#4f4a40] [word-break:keep-all]">
        {children}
      </div>
    </section>
  );
}

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: string[][];
}) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="mt-2 w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="bg-[#eeeade]">
            {head.map((h) => (
              <th
                key={h}
                className="border border-[#ddd7c6] px-3 py-2 text-left font-semibold text-[#171611]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell) => (
                <td
                  key={cell}
                  className="border border-[#ddd7c6] px-3 py-2 align-top text-[#4f4a40] [word-break:keep-all]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <main className="bg-[#f7f5ef] text-[#171611]">
      <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8 lg:py-16">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#81796a]">
          deetz
        </p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight [word-break:keep-all] lg:text-4xl">
          개인정보처리방침
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-[#4f4a40] [word-break:keep-all]">
          (주)그리고엔터테인먼트(이하 &ldquo;회사&rdquo;)는 댄서 캐스팅 플랫폼
          deetz(디츠, {SITE})를 운영하며, 이용자의 개인정보를 중요하게 생각하고
          「개인정보 보호법」 등 관련 법령을 준수합니다. 이 방침은 회사가 어떤
          개인정보를 어떤 목적으로 수집하고, 얼마나 보관하며, 이용자가 어떤
          권리를 행사할 수 있는지 안내합니다.
        </p>
        <p className="mt-2 text-sm text-[#81796a]">시행일: {UPDATED_AT}</p>

        <Section no={1} title="수집하는 개인정보 항목과 수집 방법">
          <p>회사는 서비스 제공에 필요한 최소한의 정보만 수집합니다.</p>
          <Table
            head={["구분", "수집 항목", "수집 방법"]}
            rows={[
              [
                "회원가입",
                "이메일 주소, 비밀번호, 이름 또는 활동명",
                "이용자의 직접 입력",
              ],
              [
                "프로필·포트폴리오",
                "프로필 사진, 활동 이력, 소개, 영상·이미지 링크, SNS 계정, 연락처",
                "이용자의 직접 입력 및 업로드",
              ],
              [
                "캐스팅 지원",
                "지원 내용, 생년, 신장, 장르, 참고 영상 링크 등 공고별 요청 항목",
                "이용자의 직접 입력",
              ],
              [
                "출연료 정산",
                "예금주명, 은행명, 계좌번호, 주민등록번호(원천징수 신고 목적)",
                "이용자의 직접 입력",
              ],
              [
                "고객 문의 및 SNS 상담",
                "문의 내용, 이메일 주소, Instagram 발신자 식별자·계정명·메시지 내용",
                "이메일, 웹 문의 양식, Instagram 다이렉트 메시지",
              ],
              [
                "서비스 이용 과정에서 자동 생성",
                "접속 로그, 쿠키, 기기·브라우저 정보, 이메일 열람 기록",
                "서비스 이용 시 자동 수집",
              ],
            ]}
          />
        </Section>

        <Section no={2} title="개인정보의 이용 목적">
          <ul className="list-disc space-y-1 pl-5">
            <li>회원 식별과 로그인, 본인 확인 등 서비스 운영</li>
            <li>프로필·포트폴리오 공개와 캐스팅 매칭, 공고 지원 처리</li>
            <li>출연료 정산과 세무 신고 등 법령상 의무 이행</li>
            <li>공고·지원 결과·일정 등 서비스 이용에 필요한 안내 발송</li>
            <li>문의와 제보에 대한 응대, 분쟁 처리와 기록 보존</li>
            <li>부정 이용 방지와 서비스 개선을 위한 통계 분석</li>
          </ul>
        </Section>

        <Section no={3} title="Instagram 메시지 처리에 관한 안내">
          <p>
            회사는 공식 계정 @deetz.kr 로 수신한 다이렉트 메시지를 문의 응대
            목적으로 처리합니다. Meta의 Instagram Platform을 통해 메시지 발신자
            식별자(IGSID), 계정명, 메시지 본문과 수신 시각을 전달받아 저장하고,
            문의 유형을 분류해 답변을 준비하는 데 사용합니다.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>이용 목적: 제보·협업·캐스팅 문의에 대한 확인과 답변</li>
            <li>
              처리 방식: 문의 분류와 답변 초안 작성에 자동화된 처리를 사용하며,
              발송 전 담당자가 내용을 검토합니다.
            </li>
            <li>보유 기간: 수신일로부터 3년, 이후 지체 없이 파기</li>
            <li>
              메시지 내용은 광고·마케팅 목적으로 이용하지 않으며, 제3자에게
              판매하거나 공유하지 않습니다.
            </li>
            <li>
              삭제를 원하시면 아래 문의처로 요청해 주시면 확인 후 지체 없이
              삭제합니다. 자세한 절차는{" "}
              <Link href="/data-deletion" className="underline">
                데이터 삭제 요청 안내
              </Link>
              를 참고해 주세요.
            </li>
          </ul>
        </Section>

        <Section no={4} title="개인정보의 보유 및 이용 기간">
          <p>
            원칙적으로 수집·이용 목적이 달성되면 지체 없이 파기합니다. 다만
            관계 법령에 따라 다음과 같이 보관합니다.
          </p>
          <Table
            head={["보관 항목", "보관 기간", "근거"]}
            rows={[
              ["회원 정보", "회원 탈퇴 시까지", "이용자 동의"],
              [
                "대금 결제 및 재화 공급 기록",
                "5년",
                "전자상거래 등에서의 소비자보호에 관한 법률",
              ],
              ["소비자 불만 또는 분쟁 처리 기록", "3년", "전자상거래법"],
              ["원천징수 관련 정산 자료", "5년", "국세기본법 등 세법"],
              ["접속 기록", "3개월", "통신비밀보호법"],
            ]}
          />
        </Section>

        <Section no={5} title="개인정보의 제3자 제공">
          <p>
            회사는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 다음의
            경우는 예외로 합니다.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>이용자가 사전에 동의한 경우</li>
            <li>
              캐스팅 지원 시, 해당 공고를 등록한 클라이언트에게 지원자가 제출한
              프로필과 지원 내용을 전달하는 경우
            </li>
            <li>법령에 근거해 수사기관 등이 적법한 절차로 요구하는 경우</li>
          </ul>
        </Section>

        <Section no={6} title="개인정보 처리의 위탁">
          <p>
            회사는 서비스 운영을 위해 아래와 같이 개인정보 처리를 위탁하고
            있으며, 수탁자가 관련 법령을 준수하도록 관리·감독합니다.
          </p>
          <Table
            head={["수탁자", "위탁 업무"]}
            rows={[
              ["Supabase, Inc.", "데이터베이스 및 파일 저장소 운영"],
              ["Vercel, Inc.", "웹 서비스 호스팅"],
              ["Google LLC", "이메일 발송 및 업무용 저장소"],
              ["Meta Platforms, Inc.", "Instagram 메시지 수신 및 발신"],
              ["(주)솔라피", "알림톡 및 문자 메시지 발송"],
            ]}
          />
        </Section>

        <Section no={7} title="정보주체의 권리와 행사 방법">
          <p>
            이용자는 언제든지 자신의 개인정보에 대해 열람, 정정, 삭제, 처리
            정지를 요구할 수 있습니다. 서비스 내 프로필 화면에서 직접 수정하거나,
            아래 문의처로 연락해 주시면 지체 없이 처리합니다. 만 14세 미만
            아동의 개인정보는 수집하지 않습니다.
          </p>
        </Section>

        <Section no={8} title="개인정보의 파기">
          <p>
            보유 기간이 지나거나 처리 목적이 달성된 개인정보는 지체 없이
            파기합니다. 전자적 파일은 복구할 수 없는 방법으로 영구 삭제하며,
            출력물은 분쇄하거나 소각합니다.
          </p>
        </Section>

        <Section no={9} title="안전성 확보 조치">
          <ul className="list-disc space-y-1 pl-5">
            <li>비밀번호와 주민등록번호 등 민감한 정보의 암호화 저장</li>
            <li>접근 권한 최소화와 행별 접근 제어(RLS) 적용</li>
            <li>전송 구간 암호화(HTTPS) 적용</li>
            <li>접속 기록 보관과 정기적인 점검</li>
          </ul>
        </Section>

        <Section no={10} title="개인정보 보호책임자 및 문의처">
          <Table
            head={["구분", "내용"]}
            rows={[
              ["운영 주체", "(주)그리고엔터테인먼트"],
              ["사업자등록번호", "116-81-96848"],
              ["서비스명", "deetz(디츠)"],
              ["개인정보 보호책임자", "deetz 운영팀"],
              ["문의 이메일", "contact@deetz.kr"],
            ]}
          />
          <p>
            개인정보 침해에 대한 신고나 상담이 필요하시면 개인정보침해신고센터
            (privacy.kisa.or.kr, 국번없이 118), 대검찰청 사이버수사과
            (spo.go.kr, 1301), 경찰청 사이버수사국 (ecrm.police.go.kr, 182)에
            문의하실 수 있습니다.
          </p>
        </Section>

        <Section no={11} title="방침의 변경">
          <p>
            이 개인정보처리방침의 내용이 추가, 삭제, 수정되는 경우 시행일
            7일 전부터 서비스 내 공지를 통해 안내합니다. 다만 이용자 권리에
            중대한 영향을 미치는 변경은 30일 전에 안내합니다.
          </p>
        </Section>

        <div className="mt-12 border-t border-[#ddd7c6] pt-6 text-sm text-[#81796a]">
          <Link href="/" className="underline">
            deetz 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </main>
  );
}
