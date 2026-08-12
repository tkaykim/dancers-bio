import type { BoardView } from "@/lib/casting/board-data";

export function resolveCastingCardFields(
  fields: BoardView["settings"]["fields"],
) {
  return {
    height: fields?.height !== false,
    instagram: fields?.instagram !== false,
    career: fields?.career !== false,
    profile: fields?.profile !== false,
    applicationDetails: fields?.applicationDetails === true,
  };
}

export function resolveCastingProfileAccess({
  enabled,
  reviewToken,
  dancerId,
  slug,
}: {
  enabled: boolean;
  reviewToken?: string;
  dancerId: string;
  slug: string | null;
}): "review-sheet" | "public-link" | null {
  if (!enabled) return null;
  if (
    reviewToken &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      dancerId,
    )
  ) {
    return "review-sheet";
  }
  return slug ? "public-link" : null;
}
