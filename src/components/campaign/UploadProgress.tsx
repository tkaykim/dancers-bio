import type { PublicUploads } from "@/lib/campaign/submissions";
export function UploadProgress({ uploads }: { uploads: PublicUploads }) {
  return (
    <section className="space-y-4" aria-label="업로드 현황">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-bold">업로드 현황</h2>
        <p className="text-sm text-ink-2">
          업로드 확인 <strong>{uploads.approved}</strong> / 확정 참여{" "}
          {uploads.total}
        </p>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-label="업로드 확인"
        aria-valuemin={0}
        aria-valuemax={uploads.total || 1}
        aria-valuenow={uploads.approved}
      >
        <div
          className="h-full bg-foreground"
          style={{
            width: `${uploads.total ? (uploads.approved / uploads.total) * 100 : 0}%`,
          }}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-ink-3">
              <th className="py-2">참여자</th>
              <th>진행 상태</th>
              <th>게시물</th>
            </tr>
          </thead>
          <tbody>
            {uploads.participants.map((p, i) => (
              <tr key={p.memberId ?? i} className="border-b border-border">
                <td className="py-3 font-semibold">{p.name ?? "참여자"}</td>
                <td className="whitespace-nowrap pr-3">
                  {p.urls.length ? "업로드 확인" : "진행 중"}
                </td>
                <td>
                  <div className="flex flex-wrap gap-3">
                    {p.urls.map((url, j) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="whitespace-nowrap underline underline-offset-4"
                      >
                        게시물 보기{p.urls.length > 1 ? ` ${j + 1}` : ""} ↗
                      </a>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
