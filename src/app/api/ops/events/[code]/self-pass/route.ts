import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { buildEventQrPayload } from "@/lib/ops/event-qr";

export const dynamic = "force-dynamic";

type EventRow = {
  id: string;
  ops_code: string;
};

type DancerRel = {
  stage_name: string | null;
  korean_name: string | null;
  gender: string | null;
  profile_id: string | null;
};

type ChannelRel = {
  name: string | null;
};

type ParticipantRow = {
  id: string;
  pass_token: string;
  bib_code: string | null;
  dancer_id: string | null;
  dancer: DancerRel | DancerRel[] | null;
  channel: ChannelRel | ChannelRel[] | null;
};

function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function onlyDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function genderLabel(value: string | null | undefined) {
  if (value === "male") return "남";
  if (value === "female") return "여";
  return "미기재";
}

function nameCandidates(dancer: DancerRel | null) {
  return [dancer?.stage_name, dancer?.korean_name]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];
}

function displayName(dancer: DancerRel | null) {
  return dancer?.stage_name ?? dancer?.korean_name ?? "이름 없음";
}

function buildPass(
  opsCode: string,
  row: ParticipantRow,
  dancer: DancerRel | null,
  channel: ChannelRel | null,
  phoneMissing: boolean,
) {
  return {
    id: row.id,
    name: displayName(dancer),
    bibCode: row.bib_code,
    channelName: channel?.name ?? null,
    gender: dancer?.gender ?? "unknown",
    genderLabel: genderLabel(dancer?.gender),
    phoneMissing,
    qrPayload: buildEventQrPayload(opsCode, row.pass_token),
  };
}

const PARTICIPANT_SELECT = `id, pass_token, bib_code, dancer_id,
  dancer:dancers!event_participants_dancer_id_fkey (
    stage_name, korean_name, gender, profile_id
  ),
  channel:recruitment_channels!event_participants_recruitment_channel_id_fkey (
    name
  )`;

async function resolveEvent(
  admin: ReturnType<typeof createAdminClient>,
  code: string,
): Promise<EventRow | null> {
  const { data } = await admin
    .from("project_events")
    .select("id, ops_code")
    .eq("ops_code", code)
    .maybeSingle();
  return (data as EventRow | null) ?? null;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const opsCode = (code ?? "").trim();
  if (!opsCode) {
    return NextResponse.json({ error: "잘못된 접근입니다." }, { status: 400 });
  }

  const server = await createServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const admin = createAdminClient();
  const event = await resolveEvent(admin, opsCode);
  if (!event) {
    return NextResponse.json({ error: "행사를 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: dancers, error: dancerError } = await admin
    .from("dancers")
    .select("id")
    .eq("profile_id", user.id);

  if (dancerError) {
    return NextResponse.json(
      { error: "로그인 계정의 댄서 정보를 확인하지 못했습니다." },
      { status: 500 },
    );
  }

  const dancerIds = (dancers ?? []).map((d) => (d as { id: string }).id);
  if (dancerIds.length === 0) {
    return NextResponse.json(
      { error: "로그인 계정과 연결된 댄서 프로필이 없습니다. 이름/전화번호로 조회해주세요." },
      { status: 404 },
    );
  }

  const { data: rows, error: participantError } = await admin
    .from("event_participants")
    .select(PARTICIPANT_SELECT)
    .eq("event_id", event.id)
    .in("dancer_id", dancerIds);

  if (participantError) {
    return NextResponse.json(
      { error: "현장 QR 정보를 확인하지 못했습니다." },
      { status: 500 },
    );
  }

  const matches = (rows ?? []) as unknown as ParticipantRow[];
  if (matches.length === 0) {
    return NextResponse.json(
      { error: "로그인 계정과 연결된 현장 QR이 없습니다. 이름/전화번호로 조회해주세요." },
      { status: 404 },
    );
  }
  if (matches.length > 1) {
    return NextResponse.json(
      { error: "출입증이 여러 개라 이름/전화번호로 조회해주세요." },
      { status: 409 },
    );
  }

  const row = matches[0];
  // account-linked dancer: phone presence is informational only.
  const { data: profileRow } = await admin
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .maybeSingle();
  const accountPhoneMissing =
    onlyDigits((profileRow as { phone: string | null } | null)?.phone).length === 0;

  return NextResponse.json({
    pass: buildPass(
      event.ops_code,
      row,
      one(row.dancer),
      one(row.channel),
      accountPhoneMissing,
    ),
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const opsCode = (code ?? "").trim();
  if (!opsCode) {
    return NextResponse.json({ error: "잘못된 접근입니다." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    phoneLast4?: unknown;
  } | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phoneLast4 =
    typeof body?.phoneLast4 === "string" ? onlyDigits(body.phoneLast4).slice(-4) : "";

  if (!name || !/^\d{4}$/.test(phoneLast4)) {
    return NextResponse.json(
      { error: "이름과 전화번호 뒤 4자리를 입력해주세요." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const event = await resolveEvent(admin, opsCode);
  if (!event) {
    return NextResponse.json({ error: "행사를 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: rows, error: participantError } = await admin
    .from("event_participants")
    .select(PARTICIPANT_SELECT)
    .eq("event_id", event.id);

  if (participantError) {
    return NextResponse.json(
      { error: "현장 QR 정보를 확인하지 못했습니다." },
      { status: 500 },
    );
  }

  const participants = (rows ?? []) as unknown as ParticipantRow[];
  const dancerIds = [
    ...new Set(participants.map((row) => row.dancer_id).filter(Boolean)),
  ] as string[];
  const profileIds = [
    ...new Set(
      participants
        .map((row) => one(row.dancer)?.profile_id)
        .filter(Boolean),
    ),
  ] as string[];

  // phone lives in two places: dancer_private_info (by dancer_id) and profiles (by profile_id)
  const [{ data: privateRows }, { data: profileRows }] = await Promise.all([
    dancerIds.length
      ? admin.from("dancer_private_info").select("dancer_id, phone").in("dancer_id", dancerIds)
      : Promise.resolve({ data: [] as { dancer_id: string; phone: string | null }[] }),
    profileIds.length
      ? admin.from("profiles").select("id, phone").in("id", profileIds)
      : Promise.resolve({ data: [] as { id: string; phone: string | null }[] }),
  ]);

  const phoneByDancer = new Map<string, string>();
  for (const r of (privateRows ?? []) as { dancer_id: string; phone: string | null }[]) {
    const digits = onlyDigits(r.phone);
    if (digits) phoneByDancer.set(r.dancer_id, digits);
  }
  const phoneByProfile = new Map<string, string>();
  for (const r of (profileRows ?? []) as { id: string; phone: string | null }[]) {
    const digits = onlyDigits(r.phone);
    if (digits) phoneByProfile.set(r.id, digits);
  }

  const normalizedInputName = normalizeName(name);
  const matches = participants.filter((row) => {
    const dancer = one(row.dancer);
    const phones = [
      row.dancer_id ? phoneByDancer.get(row.dancer_id) : undefined,
      dancer?.profile_id ? phoneByProfile.get(dancer.profile_id) : undefined,
    ].filter(Boolean) as string[];

    if (!phones.some((phone) => phone.endsWith(phoneLast4))) return false;

    return nameCandidates(dancer).some(
      (candidate) => normalizeName(candidate) === normalizedInputName,
    );
  });

  if (matches.length === 0) {
    return NextResponse.json(
      {
        error:
          "일치하는 출입증을 찾지 못했습니다. 활동명/이름과 전화번호 뒤 4자리를 확인하거나, 로그인해서 조회해주세요.",
      },
      { status: 404 },
    );
  }
  if (matches.length > 1) {
    return NextResponse.json(
      { error: "동명이인이 있어 현장 운영진에게 확인해주세요." },
      { status: 409 },
    );
  }

  const row = matches[0];
  return NextResponse.json({
    pass: buildPass(event.ops_code, row, one(row.dancer), one(row.channel), false),
  });
}
