"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

type PassResult = {
  id: string;
  name: string;
  bibCode: string | null;
  projectCode: string | null;
  gender: string;
  genderLabel: string;
  phoneMissing?: boolean;
  qrPayload: string;
};

const SELF_PASS_PATH = "/ndol/20260618/pass";
const LOGIN_HREF = `/login?redirect=${encodeURIComponent(SELF_PASS_PATH)}`;

export function SelfPassClient() {
  const [name, setName] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pass, setPass] = useState<PassResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLinkedPass() {
      setAutoLoading(true);
      try {
        const response = await fetch("/api/ops/ndol-20260618/self-pass", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as {
          pass?: PassResult;
          error?: string;
        } | null;

        if (cancelled) return;

        if (response.ok && payload?.pass) {
          setPass(payload.pass);
          setError(null);
        } else if (response.status !== 401 && response.status !== 404) {
          setError(
            payload?.error ??
              "자동 조회를 완료하지 못했습니다. 로그인하거나 이름/전화번호로 조회해주세요.",
          );
        }
      } catch {
        if (!cancelled) {
          setError("자동 조회를 완료하지 못했습니다. 로그인하거나 이름/전화번호로 조회해주세요.");
        }
      } finally {
        if (!cancelled) setAutoLoading(false);
      }
    }

    void loadLinkedPass();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pass) {
      setQrDataUrl(null);
      return;
    }

    let cancelled = false;
    QRCode.toDataURL(pass.qrPayload, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 9,
      color: { dark: "#17140f", light: "#ffffff" },
    }).then((value) => {
      if (!cancelled) setQrDataUrl(value);
    });

    return () => {
      cancelled = true;
    };
  }, [pass]);

  async function submit() {
    setLoading(true);
    setError(null);
    setPass(null);

    const response = await fetch("/api/ops/ndol-20260618/self-pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phoneLast4 }),
    });
    const payload = (await response.json().catch(() => null)) as {
      pass?: PassResult;
      error?: string;
    } | null;

    setLoading(false);

    if (!response.ok || !payload?.pass) {
      setError(
        payload?.error ??
          "출입증을 확인하지 못했습니다. 전화번호가 없다면 로그인하거나 운영진에게 이름으로 확인해주세요.",
      );
      return;
    }

    setPass(payload.pass);
  }

  return (
    <main className="min-h-svh bg-[#f7f7f4] px-4 py-5 text-[#17140f]">
      <div className="mx-auto flex min-h-[calc(100svh-40px)] w-full max-w-[440px] flex-col justify-between gap-5">
        <section>
          <div className="flex items-start justify-between gap-3 border-b border-black/10 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                NDOL 2026.06.18
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">
                현장 접수 QR
              </h1>
            </div>
            <div
              aria-label="dee'tz"
              className="shrink-0 text-2xl font-black leading-none text-black"
            >
              dee&apos;tz
            </div>
          </div>

          {autoLoading && !pass ? (
            <div className="mt-6 flex h-36 items-center justify-center border border-black/10 bg-white text-sm font-bold text-black/45">
              로그인 정보 확인 중
            </div>
          ) : !pass ? (
            <div className="mt-6 flex flex-col gap-4">
              <section className="border border-black/10 bg-white p-4">
                <p className="text-sm font-black text-black">
                  로그인하면 바로 찾을 수 있습니다
                </p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-black/55">
                  전화번호가 없거나 입력이 어려운 경우, 지원할 때 사용한 계정으로 로그인하면
                  본인 QR이 자동으로 표시됩니다.
                </p>
                <Link
                  href={LOGIN_HREF}
                  className="mt-4 flex h-12 items-center justify-center rounded-lg bg-black text-base font-extrabold text-white transition-colors hover:bg-black/80"
                >
                  로그인해서 내 QR 보기
                </Link>
              </section>

              <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.16em] text-black/35">
                <span className="h-px flex-1 bg-black/10" />
                또는
                <span className="h-px flex-1 bg-black/10" />
              </div>

              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold">이름 또는 활동명</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    className="h-12 rounded-lg border border-black/10 bg-white px-3 text-base outline-none focus:border-black/40"
                    placeholder="예: 김민지"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold">전화번호 뒤 4자리</span>
                  <input
                    value={phoneLast4}
                    onChange={(event) =>
                      setPhoneLast4(event.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    inputMode="numeric"
                    autoComplete="tel"
                    className="h-12 rounded-lg border border-black/10 bg-white px-3 text-base outline-none focus:border-black/40"
                    placeholder="예: 1234"
                  />
                </label>

                {error ? (
                  <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold leading-relaxed text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading || !name.trim() || phoneLast4.length !== 4}
                  className="h-12 rounded-lg bg-black text-base font-extrabold text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:bg-black/25"
                >
                  {loading ? "확인 중" : "이름/전화번호로 QR 보기"}
                </button>
                <p className="text-xs font-semibold leading-relaxed text-black/45">
                  전화번호가 없고 로그인이 어려우면 접수 데스크에서 이름 또는 활동명으로
                  확인해주세요.
                </p>
              </form>
            </div>
          ) : (
            <section className="mt-6 border border-black bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-5xl font-black tracking-tight">
                    {pass.bibCode ?? "미배정"}
                  </div>
                  <div className="mt-1 text-sm font-bold text-black/45">
                    {pass.projectCode ?? "NDOL"} · {pass.genderLabel}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPass(null);
                    setQrDataUrl(null);
                  }}
                  className="h-9 rounded-lg border border-black/10 px-2.5 text-xs font-bold text-black/55 hover:bg-black/5"
                >
                  다시 찾기
                </button>
              </div>

              <div className="my-5 flex justify-center">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt={`${pass.name} 현장 접수 QR`}
                    className="h-64 w-64"
                  />
                ) : (
                  <div className="flex h-64 w-64 items-center justify-center border border-black/10 text-sm font-semibold text-black/40">
                    QR 생성 중
                  </div>
                )}
              </div>

              <div className="border-t border-black/10 pt-4">
                <div className="truncate text-2xl font-black">{pass.name}</div>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-black/55">
                  접수 데스크에서 이 QR을 운영진에게 보여주세요.
                </p>
              </div>

              {pass.phoneMissing ? (
                <div className="mt-4 border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold leading-relaxed text-amber-900">
                  QR은 그대로 사용하셔도 됩니다. 다만 계정 또는 현장 명단에 전화번호가 없어
                  이후 본인 확인이 어려울 수 있으니, 가능하면{" "}
                  <Link href="/me" className="font-black underline underline-offset-2">
                    내 정보
                  </Link>
                  에서 휴대폰 번호를 등록해주세요.
                </div>
              ) : null}
            </section>
          )}
        </section>

        <p className="pb-2 text-center text-xs font-semibold leading-relaxed text-black/40">
          QR 조회가 되지 않으면 접수 데스크에서 이름으로 확인해주세요.
        </p>
      </div>
    </main>
  );
}
