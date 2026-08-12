export type ConsultationSlots = [string, string, string];

export type ConsultationCandidate = {
  sourceLocal: string;
  timezone: string;
  kstLocal: string | null;
};

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

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function parseLocalDateTime(value: string): DateTimeParts | null {
  const normalized = normalizeConsultationSlot(value);
  if (!normalized) return null;
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

function partsAt(date: Date, timeZone: string): DateTimeParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const result = {
      year: value("year"),
      month: value("month"),
      day: value("day"),
      hour: value("hour"),
      minute: value("minute"),
    };
    return Object.values(result).every(Number.isFinite) ? result : null;
  } catch {
    return null;
  }
}

function partsStamp(parts: DateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}

function sameParts(left: DateTimeParts, right: DateTimeParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

function formatLocalAt(date: Date, timeZone: string): string | null {
  const parts = partsAt(date, timeZone);
  if (!parts) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** Converts a wall-clock time in an IANA time zone to the matching KST datetime-local value. */
export function consultationSlotToKstLocal(value: string, timeZone: string): string | null {
  const desired = parseLocalDateTime(value);
  const zone = timeZone.trim();
  if (!desired || !zone) return null;

  let instant = partsStamp(desired);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsAt(new Date(instant), zone);
    if (!actual) return null;
    instant += partsStamp(desired) - partsStamp(actual);
  }

  const resolved = partsAt(new Date(instant), zone);
  if (!resolved || !sameParts(resolved, desired)) return null;
  return formatLocalAt(new Date(instant), "Asia/Seoul");
}

export function consultationCandidatesFromAnswers(
  answers: Record<string, unknown>,
): ConsultationCandidate[] {
  const timezone =
    typeof answers.consultationTimezone === "string"
      ? answers.consultationTimezone.trim()
      : "";
  return consultationSlotsFromAnswers(answers).map((sourceLocal) => ({
    sourceLocal,
    timezone,
    kstLocal: sourceLocal && timezone
      ? consultationSlotToKstLocal(sourceLocal, timezone)
      : null,
  }));
}
