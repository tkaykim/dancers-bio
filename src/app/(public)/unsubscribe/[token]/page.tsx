import { revalidatePath } from "next/cache";
import Link from "next/link";
import {
  getPrefsByToken,
  setUnsubscribeByToken,
} from "@/lib/notify/notification-preferences";

export const dynamic = "force-dynamic";

// 이메일 하단 원클릭 수신거부 링크의 착지 페이지.
// 링크 방문만으로 자동 수신거부되지 않게(메일 스캐너 프리페치 방지) 버튼 클릭으로 처리한다.
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const prefs = await getPrefsByToken(token);

  async function applyUnsubscribe(formData: FormData) {
    "use server";
    const t = String(formData.get("token") ?? "");
    const unsub = String(formData.get("unsub") ?? "true") === "true";
    await setUnsubscribeByToken(t, unsub);
    revalidatePath(`/unsubscribe/${t}`);
  }

  const card =
    "mx-auto mt-16 flex w-full max-w-md flex-col gap-5 rounded-2xl border border-border/60 bg-card px-6 py-8 text-center";

  if (!prefs) {
    return (
      <div className={card}>
        <h1 className="text-xl font-bold">유효하지 않은 링크</h1>
        <p className="text-sm text-ink-2">
          수신거부 링크가 만료되었거나 올바르지 않습니다.
          <br />
          로그인 후 알림 설정에서 직접 변경하실 수 있습니다.
        </p>
        <Link
          href="/me/notifications"
          className="mx-auto rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background"
        >
          알림 설정으로 이동
        </Link>
      </div>
    );
  }

  if (prefs.email_unsubscribed_all) {
    return (
      <div className={card}>
        <h1 className="text-xl font-bold">수신거부 완료</h1>
        <p className="text-sm text-ink-2">
          이제 deetz의 추천·소식 메일을 보내지 않습니다.
          <br />
          마음이 바뀌시면 언제든 다시 받아보실 수 있습니다.
        </p>
        <form action={applyUnsubscribe}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="unsub" value="false" />
          <button
            type="submit"
            className="mx-auto rounded-xl border border-border px-5 py-3 text-sm font-semibold text-foreground"
          >
            다시 메일 받기
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={card}>
      <h1 className="text-xl font-bold">메일 수신을 중단할까요?</h1>
      <p className="text-sm text-ink-2">
        확인을 누르시면 deetz의 공고 추천·소식 메일을 더 이상 보내지 않습니다.
        <br />
        (지원 결과 등 필수 안내는 계속 발송됩니다.)
      </p>
      <form action={applyUnsubscribe} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="unsub" value="true" />
        <button
          type="submit"
          className="rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background"
        >
          수신거부 확인
        </button>
      </form>
      <Link href="/me/notifications" className="text-xs text-ink-3 underline">
        항목별로 세밀하게 설정하기
      </Link>
    </div>
  );
}
