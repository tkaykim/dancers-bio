import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// 사이트 전역 OG 이미지(전 라우트 기본 og:image / twitter:image).
export const alt = "deetz — 댄서 섭외·안무 제작 플랫폼";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logoData = await readFile(join(process.cwd(), "public", "brand", "deetz-logo-black.png"), "base64");
  const logoSrc = `data:image/png;base64,${logoData}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          backgroundColor: "#f7f5ef",
          color: "#171611",
          padding: "96px",
        }}
      >
        <div
          style={{
            fontSize: 30,
            letterSpacing: 8,
            fontWeight: 600,
            color: "#7a7363",
          }}
        >
          K-POP DANCER CASTING
        </div>
        <div
          style={{
            marginTop: 18,
            display: "flex",
            width: 560,
            height: 272,
            alignItems: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires a plain img for data URL assets. */}
          <img
            src={logoSrc}
            alt="dee'tz"
            width={560}
            height={272}
            style={{
              display: "block",
            }}
          />
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 46,
            fontWeight: 600,
            color: "#3f3a30",
          }}
        >
          Dancer Casting &amp; Choreography Platform
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 80,
            right: 96,
            fontSize: 30,
            fontWeight: 600,
            color: "#7a7363",
          }}
        >
          deetz.kr
        </div>
      </div>
    ),
    { ...size },
  );
}
