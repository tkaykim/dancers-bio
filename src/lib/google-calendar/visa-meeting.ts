import "server-only";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DEFAULT_CALENDAR_ID = "contact@deetz.kr";

type CalendarConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
};

type GoogleEvent = {
  id?: string;
  summary?: string;
  status?: string;
  transparency?: string;
  eventType?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  conferenceData?: {
    createRequest?: { status?: { statusCode?: string } };
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
};

type GoogleEventsList = { items?: GoogleEvent[] };

export type VisaMeetingCalendarEvent = {
  eventId: string;
  eventUrl: string | null;
  meetUrl: string | null;
  calendarId: string;
  conferenceStatus: "ready" | "pending";
};

export type CreateVisaMeetingCalendarEventInput = {
  eventId: string;
  applicationId: string;
  inviteId: string;
  applicantEmail: string;
  applicantName: string;
  meetingAtIso: string;
  durationMinutes: number;
};

export type VisaMeetingCalendarScheduleEvent = {
  id: string;
  summary: string;
  startIso: string;
  endIso: string;
  allDay: boolean;
  eventUrl: string | null;
  conflicts: boolean;
};

export type VisaMeetingCalendarSchedule = {
  calendarId: string;
  dateKst: string;
  checkedStartIso: string;
  checkedEndIso: string;
  events: VisaMeetingCalendarScheduleEvent[];
  conflictCount: number;
};

let accessTokenCache: { token: string; expiresAt: number } | null = null;

function config(): CalendarConfig {
  const clientId = process.env.DEETZ_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.DEETZ_GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.DEETZ_GOOGLE_REFRESH_TOKEN?.trim();
  const calendarId =
    process.env.DEETZ_GOOGLE_CALENDAR_ID?.trim() || DEFAULT_CALENDAR_ID;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Calendar 서버 인증 환경변수가 설정되지 않았습니다.");
  }
  return { clientId, clientSecret, refreshToken, calendarId };
}

async function accessToken(forceRefresh = false): Promise<string> {
  if (
    !forceRefresh &&
    accessTokenCache &&
    accessTokenCache.expiresAt > Date.now() + 30_000
  ) {
    return accessTokenCache.token;
  }

  const current = config();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: current.clientId,
      client_secret: current.clientSecret,
      refresh_token: current.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description || `Google OAuth 토큰 갱신 실패 (${response.status})`,
    );
  }

  accessTokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}

async function calendarFetch<T>(
  path: string,
  init: RequestInit = {},
  retryAuth = true,
): Promise<{ response: Response; data: T | null }> {
  const token = await accessToken(!retryAuth);
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (response.status === 401 && retryAuth) {
    accessTokenCache = null;
    return calendarFetch<T>(path, init, false);
  }
  const data = (await response.json().catch(() => null)) as T | null;
  return { response, data };
}

function apiError(response: Response, data: unknown): Error {
  const message =
    data && typeof data === "object" && "error" in data
      ? JSON.stringify((data as { error: unknown }).error).slice(0, 500)
      : `HTTP ${response.status}`;
  return new Error(`Google Calendar 요청 실패: ${message}`);
}

function meetingResult(event: GoogleEvent, calendarId: string): VisaMeetingCalendarEvent {
  const meetUrl =
    event.hangoutLink ||
    event.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === "video" && entry.uri,
    )?.uri ||
    null;
  return {
    eventId: event.id || "",
    eventUrl: event.htmlLink || null,
    meetUrl,
    calendarId,
    conferenceStatus: meetUrl ? "ready" : "pending",
  };
}

async function getEvent(calendarId: string, eventId: string): Promise<GoogleEvent> {
  const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1`;
  const { response, data } = await calendarFetch<GoogleEvent>(path);
  if (!response.ok || !data) throw apiError(response, data);
  return data;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function eventBoundaryIso(
  boundary: { dateTime?: string; date?: string } | undefined,
  fallback: string,
): { iso: string; allDay: boolean } {
  if (boundary?.dateTime) return { iso: new Date(boundary.dateTime).toISOString(), allDay: false };
  if (boundary?.date) return { iso: new Date(`${boundary.date}T00:00:00+09:00`).toISOString(), allDay: true };
  return { iso: fallback, allDay: false };
}

function blocksMeeting(event: GoogleEvent): boolean {
  return (
    event.status !== "cancelled" &&
    event.transparency !== "transparent" &&
    event.eventType !== "workingLocation" &&
    event.eventType !== "birthday"
  );
}

/** Lists the selected KST day's Calendar events and marks overlaps with the proposed meeting. */
export async function listVisaMeetingCalendarSchedule(input: {
  meetingAtIso: string;
  durationMinutes: number;
  excludeEventId?: string | null;
}): Promise<VisaMeetingCalendarSchedule> {
  const { calendarId } = config();
  const checkedStart = new Date(input.meetingAtIso);
  const checkedEnd = new Date(checkedStart.getTime() + input.durationMinutes * 60_000);
  const dateKst = input.meetingAtIso.slice(0, 10);
  const dayStart = new Date(`${dateKst}T00:00:00+09:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
  const query = new URLSearchParams({
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    timeZone: "Asia/Seoul",
    singleEvents: "true",
    orderBy: "startTime",
    showDeleted: "false",
    maxResults: "100",
    fields: "items(id,summary,status,transparency,eventType,htmlLink,start,end)",
  });
  const path = `/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`;
  const { response, data } = await calendarFetch<GoogleEventsList>(path);
  if (!response.ok || !data) throw apiError(response, data);

  const events = (data.items ?? [])
    .filter((event) => event.status !== "cancelled" && event.id !== input.excludeEventId)
    .map((event): VisaMeetingCalendarScheduleEvent => {
      const start = eventBoundaryIso(event.start, dayStart.toISOString());
      const end = eventBoundaryIso(event.end, dayEnd.toISOString());
      const conflicts =
        blocksMeeting(event) &&
        new Date(start.iso).getTime() < checkedEnd.getTime() &&
        new Date(end.iso).getTime() > checkedStart.getTime();
      return {
        id: event.id || "",
        summary: event.summary?.trim() || "제목 없는 일정",
        startIso: start.iso,
        endIso: end.iso,
        allDay: start.allDay || end.allDay,
        eventUrl: event.htmlLink || null,
        conflicts,
      };
    });
  return {
    calendarId,
    dateKst,
    checkedStartIso: checkedStart.toISOString(),
    checkedEndIso: checkedEnd.toISOString(),
    events,
    conflictCount: events.filter((event) => event.conflicts).length,
  };
}

async function waitForMeet(
  calendarId: string,
  event: GoogleEvent,
): Promise<VisaMeetingCalendarEvent> {
  let current = meetingResult(event, calendarId);
  if (current.meetUrl || !current.eventId) return current;

  for (const delay of [400, 800, 1200]) {
    await wait(delay);
    current = meetingResult(await getEvent(calendarId, current.eventId), calendarId);
    if (current.meetUrl) return current;
  }
  return current;
}

/** Creates an idempotent Calendar event and requests a unique Google Meet room. */
export async function createOrGetVisaMeetingCalendarEvent(
  input: CreateVisaMeetingCalendarEventInput,
): Promise<VisaMeetingCalendarEvent> {
  const { calendarId } = config();
  const end = new Date(
    new Date(input.meetingAtIso).getTime() + input.durationMinutes * 60_000,
  ).toISOString();
  const path = `/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
  const body = {
    id: input.eventId,
    summary: `[deetz] ${input.applicantName} online meeting`,
    description:
      "deetz Korea dance program online meeting.\n\nQuestions: contact@deetz.kr",
    start: { dateTime: input.meetingAtIso, timeZone: "Asia/Seoul" },
    end: { dateTime: end, timeZone: "Asia/Seoul" },
    attendees: [{ email: input.applicantEmail }],
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    conferenceData: {
      createRequest: {
        requestId: input.eventId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    extendedProperties: {
      private: {
        deetzApplicationId: input.applicationId,
        deetzInviteId: input.inviteId,
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 30 },
      ],
    },
  };

  const { response, data } = await calendarFetch<GoogleEvent>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (response.status === 409) {
    return waitForMeet(calendarId, await getEvent(calendarId, input.eventId));
  }
  if (!response.ok || !data) throw apiError(response, data);
  return waitForMeet(calendarId, data);
}
