import Image from "next/image";

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
      className={className}
    />
  );
}
