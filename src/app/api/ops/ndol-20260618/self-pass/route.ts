import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { buildNdolQrPayload } from "@/lib/ops/ndol-qr";

export const dynamic = "force-dynamic";

const EVENT_KEY = "ndol-20260618";

type TestPass = {
  name: string;
  code: string;
};

const TEST_PASSES = new Map<string, TestPass>([
  ["odh@grigoent.co.kr", { name: "ODH 테스트", code: "TEST:ODH" }],
  ["hs@astcompany.co.kr", { name: "HS 테스트", code: "TEST:HS" }],
]);

type ContactRow = {
  id: string;
  name: string | null;
  gender: "male" | "female" | "unknown" | string | null;
  project_code: string | null;
  bib_code: string | null;
  phone: string | null;
  dancer_id: string | null;
};

type ProfileRow = {
  phone: string | null;
};

type DancerRow = {
  id: string;
  stage_name: string | null;
  korean_name: string | null;
  profile_id?: string | null;
};

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

function rowNameCandidates(row: ContactRow, dancer?: DancerRow) {
  return [row.name, dancer?.stage_name, dancer?.korean_name]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];
}

function buildPass(row: ContactRow, dancer?: DancerRow, accountPhone?: string | null) {
  const accountPhoneMissing =
    accountPhone === undefined ? false : onlyDigits(accountPhone).length === 0;

  return {
    id: row.id,
    name: row.name ?? dancer?.stage_name ?? dancer?.korean_name ?? "이름 없음",
    bibCode: row.bib_code,
    projectCode: row.project_code,
    gender: row.gender ?? "unknown",
    genderLabel: genderLabel(row.gender),
    phoneMissing: onlyDigits(row.phone).length === 0 || accountPhoneMissing,
    qrPayload: buildNdolQrPayload(row.id),
  };
}

function buildTestPass(email: string) {
  const tester = TEST_PASSES.get(email.toLowerCase());
  if (!tester) return null;

  return {
    id: tester.code,
    name: tester.name,
    bibCode: "TEST",
    projectCode: "참가자 테스트",
    gender: "unknown",
    genderLabel: "테스트",
    phoneMissing: false,
    qrPayload: buildNdolQrPayload(tester.code),
  };
}

async function loadAvailableContacts(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin
    .from("ops_ndol_contacts")
    .select("id,name,gender,project_code,bib_code,phone,dancer_id")
    .eq("event_key", EVENT_KEY)
    .eq("outreach_status", "available")
    .not("bib_code", "is", null);

  return { rows: (data ?? []) as ContactRow[], error };
}

async function loadDancerMap(admin: ReturnType<typeof createAdminClient>, rows: ContactRow[]) {
  const dancerIds = [...new Set(rows.map((row) => row.dancer_id).filter(Boolean))] as string[];
  const dancerById = new Map<string, DancerRow>();

  if (dancerIds.length === 0) {
    return { dancerById, error: null };
  }

  const { data, error } = await admin
    .from("dancers")
    .select("id,stage_name,korean_name,profile_id")
    .in("id", dancerIds);

  for (const dancer of (data ?? []) as DancerRow[]) {
    dancerById.set(dancer.id, dancer);
  }

  return { dancerById, error };
}

export async function GET() {
  const server = await createServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const testPass = user.email ? buildTestPass(user.email) : null;

  const admin = createAdminClient();
  const [{ data: dancers, error: dancerError }, { data: profile, error: profileError }] =
    await Promise.all([
      admin
        .from("dancers")
        .select("id,stage_name,korean_name,profile_id")
        .eq("profile_id", user.id),
      admin.from("profiles").select("phone").eq("id", user.id).maybeSingle(),
    ]);

  if (dancerError) {
    return NextResponse.json(
      { error: "로그인 계정의 댄서 정보를 확인하지 못했습니다." },
      { status: 500 },
    );
  }
  if (profileError) {
    return NextResponse.json(
      { error: "로그인 계정의 전화번호 정보를 확인하지 못했습니다." },
      { status: 500 },
    );
  }

  const dancerRows = (dancers ?? []) as DancerRow[];
  const dancerIds = dancerRows.map((dancer) => dancer.id);
  if (dancerIds.length === 0) {
    if (testPass) {
      return NextResponse.json({ pass: testPass });
    }

    return NextResponse.json(
      { error: "로그인 계정과 연결된 댄서 프로필이 없습니다." },
      { status: 404 },
    );
  }

  const { data: contacts, error: contactError } = await admin
    .from("ops_ndol_contacts")
    .select("id,name,gender,project_code,bib_code,phone,dancer_id")
    .eq("event_key", EVENT_KEY)
    .eq("outreach_status", "available")
    .not("bib_code", "is", null)
    .in("dancer_id", dancerIds);

  if (contactError) {
    return NextResponse.json(
      { error: "출입증 정보를 확인하지 못했습니다." },
      { status: 500 },
    );
  }

  const matches = (contacts ?? []) as ContactRow[];
  if (matches.length === 0) {
    if (testPass) {
      return NextResponse.json({ pass: testPass });
    }

    return NextResponse.json(
      { error: "로그인 계정과 연결된 현장 QR이 없습니다. 이름/전화번호로 조회해주세요." },
      { status: 404 },
    );
  }

  if (matches.length > 1) {
    return NextResponse.json(
      { error: "로그인 계정에 여러 출입증이 있어 이름/전화번호로 조회해주세요." },
      { status: 409 },
    );
  }

  const dancerById = new Map(dancerRows.map((dancer) => [dancer.id, dancer]));
  const row = matches[0];
  return NextResponse.json({
    pass: buildPass(
      row,
      row.dancer_id ? dancerById.get(row.dancer_id) : undefined,
      ((profile as ProfileRow | null) ?? null)?.phone ?? null,
    ),
  });
}

export async function POST(req: Request) {
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
  const { rows, error: contactError } = await loadAvailableContacts(admin);

  if (contactError) {
    return NextResponse.json(
      { error: "출입증 정보를 확인하지 못했습니다." },
      { status: 500 },
    );
  }

  const { dancerById, error: dancerError } = await loadDancerMap(admin, rows);
  if (dancerError) {
    return NextResponse.json(
      { error: "댄서 이름 정보를 확인하지 못했습니다." },
      { status: 500 },
    );
  }

  const normalizedInputName = normalizeName(name);
  const matches = rows.filter((row) => {
    const phone = onlyDigits(row.phone);
    if (!phone.endsWith(phoneLast4)) return false;

    const dancer = row.dancer_id ? dancerById.get(row.dancer_id) : undefined;
    return rowNameCandidates(row, dancer).some(
      (candidate) => normalizeName(candidate) === normalizedInputName,
    );
  });

  if (matches.length === 0) {
    return NextResponse.json(
      {
        error:
          "일치하는 출입증을 찾지 못했습니다. 활동명/이름과 전화번호 뒤 4자리를 다시 확인해주세요.",
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
    pass: buildPass(row, row.dancer_id ? dancerById.get(row.dancer_id) : undefined),
  });
}
