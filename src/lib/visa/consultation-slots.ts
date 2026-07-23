export type ConsultationSlots = [string, string, string];

const LOCAL_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?(?:\s+(?:[A-Za-z][A-Za-z0-9_+\-/:]*|\([^)]+\)))?$/;

export function normalizeConsultationSlot(value: string): string {
  const match = value.trim().match(LOCAL_DATE_TIME);
  if (!match) return "";

  const [, year, month, day, hour, minute] = match;
  const numericMonth = Number(month);
  const numericDay = Number(day);
  const numericHour = Number(hour);
  const numericMinute = Number(minute);
  const daysInMonth =
    numericMonth >= 1 && numericMonth <= 12
      ? new Date(Date.UTC(Number(year), numericMonth, 0)).getUTCDate()
      : 0;

  if (
    numericDay < 1 ||
    numericDay > daysInMonth ||
    numericHour > 23 ||
    numericMinute > 59
  ) {
    return "";
  }

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function consultationSlotsFromAnswers(
  answers: Record<string, unknown>,
): ConsultationSlots {
  const structured = Array.isArray(answers.consultationSlots)
    ? answers.consultationSlots.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const legacy =
    typeof answers.consultationAvailability === "string"
      ? answers.consultationAvailability.split(/\s*;\s*|\r?\n+/)
      : [];
  const source = hasThreeUniqueConsultationSlots(structured)
    ? structured
    : legacy;

  return [0, 1, 2].map((index) =>
    normalizeConsultationSlot((source[index] ?? "").replace(/^\s*\d+\.\s*/, "")),
  ) as ConsultationSlots;
}

export function hasThreeUniqueConsultationSlots(
  slots: readonly string[],
): boolean {
  const normalized = slots.map(normalizeConsultationSlot);
  return (
    normalized.length === 3 &&
    normalized.every(Boolean) &&
    new Set(normalized).size === 3
  );
}

export function formatConsultationAvailability(
  slots: readonly string[],
  timezone: string,
): string {
  const zone = timezone.trim();
  return slots
    .map(
      (slot, index) =>
        `${index + 1}. ${normalizeConsultationSlot(slot).replace("T", " ")} (${zone})`,
    )
    .join("\n");
}
