export type ApplicationScheduleResponse = {
  schedule_id: string;
  status: "available" | "unavailable";
};

export type AvailabilitySelectionResult =
  | { ok: true; responses: ApplicationScheduleResponse[] }
  | { ok: false; error: string };

/**
 * 지원서에서 받은 일정 선택을 이 프로젝트의 전체 가능여부 응답으로 정규화한다.
 * 선택한 일정은 가능, 선택하지 않은 일정은 불가로 저장한다.
 */
export function resolveAvailabilitySelection(
  availableScheduleIds: string[],
  submittedScheduleIds: string[],
): AvailabilitySelectionResult {
  if (availableScheduleIds.length === 0) {
    return { ok: true, responses: [] };
  }

  const allowed = new Set(availableScheduleIds);
  const selected = new Set(
    submittedScheduleIds.map((id) => id.trim()).filter(Boolean),
  );

  if (selected.size === 0) {
    return {
      ok: false,
      error: "참석 가능한 일정을 하나 이상 선택해 주세요.",
    };
  }

  if ([...selected].some((id) => !allowed.has(id))) {
    return {
      ok: false,
      error: "선택한 일정 정보를 다시 확인해 주세요.",
    };
  }

  return {
    ok: true,
    responses: availableScheduleIds.map((schedule_id) => ({
      schedule_id,
      status: selected.has(schedule_id) ? "available" : "unavailable",
    })),
  };
}
