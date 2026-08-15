import Image from "next/image";
import { cn } from "@/lib/utils";
import { DeetzLogo } from "@/components/brand/DeetzLogo";
import type { Brand } from "@/lib/brand";

type BrandLogoProps = {
  brand: Brand;
  className?: string;
  priority?: boolean;
  tone?: "ink" | "white";
};

const grigoByTone = {
  ink: "/brand/grigo-logo-ink.png",
  white: "/brand/grigo-logo-white.png",
} as const;

// 화이트라벨 로고 스위치. deetz 브랜드면 기존 DeetzLogo 그대로 —
// deetz 화면의 로고 규칙(항상 DeetzLogo 컴포넌트)은 이 스위치 안에서 유지된다.
export function BrandLogo({
  brand,
  className = "h-7 w-auto",
  priority = false,
  tone = "ink",
}: BrandLogoProps) {
  if (brand === "deetz") {
    return <DeetzLogo className={className} priority={priority} tone={tone} />;
  }
  return (
    <Image
      src={grigoByTone[tone]}
      alt="GRIGO ENT"
      width={228}
      height={111}
      priority={priority}
      sizes="120px"
      className={cn("w-fit shrink-0 self-start", className)}
    />
  );
}
