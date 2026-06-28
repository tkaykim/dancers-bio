import Image from "next/image";
import { cn } from "@/lib/utils";

type DeetzLogoProps = {
  className?: string;
  priority?: boolean;
  tone?: "ink" | "white";
};

const logoByTone = {
  ink: "/brand/deetz-logo-black.png",
  white: "/brand/deetz-logo-white.png",
} as const;

export function DeetzLogo({
  className = "h-7 w-auto",
  priority = false,
  tone = "ink",
}: DeetzLogoProps) {
  return (
    <Image
      src={logoByTone[tone]}
      alt="dee'tz"
      width={3364}
      height={1632}
      priority={priority}
      sizes="120px"
      // self-start·shrink-0·w-fit: flex/grid 부모(items-stretch)에서 가로로 늘어나 깨지는 것 방지.
      className={cn("w-fit shrink-0 self-start", className)}
    />
  );
}
