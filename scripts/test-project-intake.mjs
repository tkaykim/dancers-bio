import test from "node:test";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  intakeInputSchema,
  validateResult,
} from "../src/lib/project-intake/schema.ts";
import {
  cleanOAuthEnv,
  imageBlock,
  runOnce,
} from "./project-intake-worker.mjs";
import sharp from "sharp";
import {
  intakeFormDefaults,
  koreanDateTimeInput,
} from "../src/lib/project-intake/prefill.ts";
import { intakeProgress } from "../src/lib/project-intake/progress.ts";
test("existing form prefill preserves Korean deadlines, fees, genre and schedules", () => {
  const draft = {
    ...sample().project,
    pay_amount: 150000,
    genre_slug: "hiphop",
    schedules: [
      {
        label: "촬영",
        starts_at: "2026-10-03T08:30:00Z",
        ends_at: "2026-10-03T09:00:00Z",
        time_tbd: false,
        location: "서울",
      },
    ],
  };
  const values = intakeFormDefaults(draft, [
    { id: "genre-id", slug: "hiphop" },
  ]);
  assert.equal(koreanDateTimeInput("2026-09-14T14:00:00Z"), "2026-09-14T23:00");
  assert.equal(values.genre_id, "genre-id");
  assert.equal(values.pay_amount, 150000);
  assert.deepEqual(values.schedules, [
    {
      label: "촬영",
      date: "2026-10-03",
      start: "17:30",
      end: "18:00",
      location: "서울",
    },
  ]);
  const job = {
    status: "queued",
    result: null,
    languages: ["ko", "en"],
    assets: [],
  };
  assert.equal(intakeProgress(job).stage, 0);
  assert.equal(intakeProgress({ ...job, status: "processing" }).stage, 1);
  assert.equal(
    intakeProgress({ ...job, status: "processing", result: {} }).stage,
    2,
  );
  assert.equal(
    intakeProgress({ ...job, status: "review", result: {} }).stage,
    3,
  );
  assert.equal(intakeProgress({ ...job, status: "failed" }).failed, true);
});
test("dates match between UTC SSR and Korean browsers", () => {
  const moduleUrl = new URL(
    "../src/lib/project-intake/date.ts",
    import.meta.url,
  ).href;
  const script = `import {formatIntakeDate} from ${JSON.stringify(moduleUrl)}; console.log(formatIntakeDate('2026-09-12T13:41:18Z'));`;
  const render = (tz) =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  assert.equal(render("UTC"), render("Asia/Seoul"));
  assert.match(render("UTC"), /10:41:18/);
});
const sample = () => ({
  project: {
    title: "단기 레슨 강사 모집",
    description: "연습생 레슨 강사를 모집합니다.",
    category: "instructor",
    genre_slug: null,
    region_text: null,
    pay_type: "negotiable",
    pay_amount: null,
    recruitment_count: 1,
    recruitment_unlimited: false,
    application_deadline: null,
    visibility: "private",
    collect_applicant_fee: true,
    collect_casting_details: false,
  },
  source_transcript: "단기 레슨",
  missing: ["장소 확인"],
  evidence: [{ field: "category", quote: "레슨" }],
  private_terms: ["Secret Company"],
  decks: [
    {
      language: "ko",
      title: "여성 강사 모집",
      caption: "지원은 @deetz.kr → link in bio → 공고에서 신청하세요.",
      slides: [
        { layout: "cover", eyebrow: "DEETZ", title: ["강사 모집"] },
        {
          layout: "points",
          eyebrow: "지원 안내",
          title: ["지원하기"],
          items: [["일정", "협의"]],
        },
      ],
    },
  ],
});
test("text/image input bounds and duplicate languages", () => {
  const base = {
    request_id: crypto.randomUUID(),
    source_raw: "",
    source_paths: [],
    languages: ["ko"],
    private_terms: [],
  };
  assert.equal(intakeInputSchema.safeParse(base).success, false);
  assert.equal(
    intakeInputSchema.safeParse({ ...base, source_paths: ["a.png"] }).success,
    true,
  );
  assert.equal(
    intakeInputSchema.safeParse({ ...base, source_raw: "a".repeat(20001) })
      .success,
    false,
  );
  assert.equal(
    intakeInputSchema.safeParse({
      ...base,
      source_paths: ["a"],
      languages: ["ko", "ko"],
    }).success,
    false,
  );
});
test("private terms, html, wrong language and card count are blocked", () => {
  assert.equal(validateResult(sample(), ["ko"], []).project.pay_amount, null);
  const leak = sample();
  leak.decks[0].caption += " SECRET COMPANY";
  assert.throws(() => validateResult(leak, ["ko"], []));
  const html = sample();
  html.project.description += "<img src=x>";
  assert.throws(() => validateResult(html, ["ko"], []));
  assert.throws(() => validateResult(sample(), ["en"], []));
  const count = sample();
  count.decks[0].slides.pop();
  assert.throws(() => validateResult(count, ["ko"], []));
});
test("OAuth env excludes paid credentials and alternative endpoints", () => {
  const env = cleanOAuthEnv({
    ANTHROPIC_API_KEY: "paid",
    OPENAI_API_KEY: "paid",
    ANTHROPIC_AUTH_TOKEN: "paid",
    ANTHROPIC_BASE_URL: "proxy",
    CLAUDE_CODE_USE_VERTEX: "1",
    PATH: "keep",
  });
  assert.equal(env.PATH, "keep");
  for (const k of [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_USE_VERTEX",
  ])
    assert.equal(env[k], undefined);
});
test("images decode and resize; invalid bytes fail", async () => {
  await assert.rejects(imageBlock(Buffer.from("<script>bad</script>")));
  const png = await sharp({
    create: { width: 2400, height: 4500, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  const b = await imageBlock(png);
  const m = await sharp(Buffer.from(b.source.data, "base64")).metadata();
  assert.ok(m.width <= 2000 && m.height <= 4000);
});
test("database claim recovery, registration idempotency and atomic channel creation", async () => {
  const require = createRequire(import.meta.url);
  const { PGlite } = await import(
    pathToFileURL(require.resolve("@electric-sql/pglite")).href
  );
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table profiles(id uuid primary key,is_admin boolean);create table genres(id uuid primary key,slug text);
      create type project_visibility as enum('public','private');create type project_category as enum('instructor','other');create type pay_type as enum('per_session','total','negotiable');
      create table projects(id uuid primary key default gen_random_uuid(),owner_id uuid,title text,description text,visibility project_visibility,status text,category project_category,genre_id uuid,region_text text,pay_type pay_type,pay_amount int,recruitment_count int,recruitment_unlimited bool,application_deadline timestamptz,posted_by_label text,collect_applicant_fee bool,collect_casting_details bool,auto_accept_on_apply bool,allow_team_apply bool);
      create table recruitment_channels(project_id uuid,name text,channel_type text,manager_label text,created_by uuid);`);
    await db.exec(
      await readFile(
        new URL(
          "../db/migrations/20260912110952_project_intake_studio.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const actor = crypto.randomUUID(),
      id = crypto.randomUUID();
    await db.query("insert into profiles values($1,true)", [actor]);
    await db.query(
      "insert into project_intake_jobs(id,created_by,source_raw,languages) values($1,$2,'abcdefghij',array['ko'])",
      [id, actor],
    );
    const first = (await db.query("select * from claim_project_intake()"))
      .rows[0];
    assert.equal(first.status, "processing");
    assert.equal(
      (await db.query("select * from claim_project_intake()")).rows.length,
      0,
    );
    await db.query(
      "update project_intake_jobs set lease_until=now()-interval '1 minute' where id=$1",
      [id],
    );
    const recovered = (await db.query("select * from claim_project_intake()"))
      .rows[0];
    assert.notEqual(recovered.lease_token, first.lease_token);
    assert.equal(
      (
        await db.query(
          "update project_intake_jobs set status='review' where id=$1 and lease_token=$2 returning id",
          [id, first.lease_token],
        )
      ).rows.length,
      0,
    );
    await db.query(
      "update project_intake_jobs set status='review', result=$2, assets='[{},{}]' where id=$1",
      [id, sample()],
    );
    await assert.rejects(
      db.query("select register_project_intake($1,99,$2)", [id, actor]),
    );
    await assert.rejects(
      db.query("select register_project_intake($1,1,$2)", [
        id,
        crypto.randomUUID(),
      ]),
    );
    const pid = (
      await db.query("select register_project_intake($1,1,$2) as id", [
        id,
        actor,
      ])
    ).rows[0].id;
    assert.equal(
      (
        await db.query("select register_project_intake($1,1,$2) as id", [
          id,
          actor,
        ])
      ).rows[0].id,
      pid,
    );
    const projects = (await db.query("select * from projects")).rows;
    assert.equal(projects.length, 1);
    assert.equal(projects[0].status, "draft");
    assert.equal(projects[0].auto_accept_on_apply, false);
    assert.equal(
      (await db.query("select * from recruitment_channels")).rows.length,
      1,
    );
    const access = (
      await db.query(
        "select has_table_privilege('anon','project_intake_jobs','select') as a,has_table_privilege('authenticated','project_intake_jobs','select') as b,has_function_privilege('anon','claim_project_intake()','execute') as c",
      )
    ).rows[0];
    assert.deepEqual(access, { a: false, b: false, c: false });
    // Exercise the actual worker state machine against PostgreSQL with fake model/Studio boundaries.
    const stored = new Map();
    let uploadFails = false;
    const adapter = {
      rpc: async () => ({
        data: (await db.query("select * from claim_project_intake()")).rows,
      }),
      from: (table) => ({
        select: async () => ({ data: [] }),
        update: (values) => {
          const filters = [];
          const chain = {
            eq(k, v) {
              filters.push([k, v]);
              return chain;
            },
            async select() {
              const entries = Object.entries(values),
                args = entries.map(([, v]) => v);
              const where = filters
                .map(([k, v]) => {
                  args.push(v);
                  return `${k}=$${args.length}`;
                })
                .join(" and ");
              const r = await db.query(
                `update ${table} set ${entries.map(([k], i) => `${k}=$${i + 1}`).join(",")} where ${where} returning id`,
                args,
              );
              return { data: r.rows };
            },
          };
          return chain;
        },
      }),
      storage: {
        from: () => ({
          upload: async (key, bytes) => {
            if (uploadFails) return { error: new Error("private SDK details") };
            stored.set(key, bytes);
            return { error: null };
          },
        }),
      },
    };
    await mkdir("scripts/out", { recursive: true });
    const card = "scripts/out/intake-test-card.png";
    await sharp({
      create: { width: 1080, height: 1350, channels: 3, background: "#fff" },
    })
      .png()
      .toFile(card);
    const workerId = crypto.randomUUID();
    await db.query(
      "insert into project_intake_jobs(id,created_by,source_raw,languages) values($1,$2,'abcdefghij',array['ko'])",
      [workerId, actor],
    );
    const dependencies = {
      extract: async () => sample(),
      render: async () => ({
        id: "studio-test",
        renderedImages: { light: [card, card] },
      }),
    };
    assert.equal(await runOnce(adapter, dependencies), true);
    const ready = (
      await db.query("select * from project_intake_jobs where id=$1", [
        workerId,
      ])
    ).rows[0];
    assert.equal(ready.status, "review");
    assert.equal(ready.assets.length, 2);
    assert.equal(stored.size, 2);
    assert.equal(
      (await db.query("select * from projects")).rows.length,
      1,
      "worker must not publish/register without review",
    );
    assert.equal(await runOnce(adapter, dependencies), false, "idle worker");
    // Default-channel failure rolls back the whole project registration.
    await db.exec(
      "alter table recruitment_channels add constraint test_channel_reject check (name <> '기본 모집') not valid;",
    );
    await assert.rejects(
      db.query("select register_project_intake($1,1,$2)", [workerId, actor]),
    );
    assert.equal((await db.query("select * from projects")).rows.length, 1);
    await db.exec(
      "alter table recruitment_channels drop constraint test_channel_reject;",
    );
    uploadFails = true;
    const failId = crypto.randomUUID();
    await db.query(
      "insert into project_intake_jobs(id,created_by,source_raw,languages) values($1,$2,'abcdefghij',array['ko'])",
      [failId, actor],
    );
    await runOnce(adapter, dependencies);
    const failed = (
      await db.query("select * from project_intake_jobs where id=$1", [failId])
    ).rows[0];
    assert.equal(failed.status, "failed");
    assert.equal(failed.assets.length, 0);
    assert.ok(!failed.error.includes("SDK"));
    // A reviewed existing-form submission is atomic, including schedules and attachments.
    await db.exec(`alter table projects add region_id uuid, add is_standing_pool boolean, add selection_rounds integer, add round_labels text[], add round_messages jsonb;
      create table project_schedules(project_id uuid,label text,starts_at timestamptz,ends_at timestamptz,location text,time_tbd boolean,sort_order integer,created_by uuid);
      create table project_attachments(project_id uuid,file_name text,storage_path text,mime_type text,size_bytes bigint,sort_order integer,created_by uuid);`);
    await db.exec(
      await readFile(
        new URL(
          "../db/migrations/20260913093000_intake_project_form.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const formId = crypto.randomUUID();
    await db.query(
      "insert into project_intake_jobs(id,created_by,source_raw,languages,status,result) values($1,$2,'edited form source',array['ko'],'processing',$3)",
      [formId, actor, sample()],
    );
    const payload = {
      ...sample().project,
      title: "관리자가 수정한 공고",
      description: "관리자가 검토한 설명입니다.",
      status: "open",
      pay_amount: 170000,
      application_deadline: "2026-09-14T14:00:00Z",
      selection_rounds: 3,
      round_labels: ["첫 검토", "이미지 미팅", "최종"],
      is_standing_pool: false,
    };
    const schedules = [
      {
        label: "촬영",
        starts_at: "2026-10-03T17:30:00+09:00",
        ends_at: "2026-10-03T18:00:00+09:00",
        time_tbd: false,
        location: "서울",
      },
    ];
    const args = [formId, 1, actor, payload, schedules, []];
    const call =
      "select * from register_project_intake_form($1,$2,$3,$4,$5,$6)";
    await assert.rejects(
      db.query(call, [formId, 2, actor, payload, schedules, []]),
    );
    await assert.rejects(
      db.query(call, [formId, 1, crypto.randomUUID(), payload, schedules, []]),
    );
    await db.exec(
      "alter table project_schedules add constraint reject_test check(label <> '촬영') not valid",
    );
    const countBefore = (
      await db.query("select count(*) as count from projects")
    ).rows[0].count;
    await assert.rejects(db.query(call, args));
    assert.equal(
      (await db.query("select count(*) as count from projects")).rows[0].count,
      countBefore,
    );
    assert.equal(
      (
        await db.query(
          "select project_id from project_intake_jobs where id=$1",
          [formId],
        )
      ).rows[0].project_id,
      null,
    );
    await db.exec("alter table project_schedules drop constraint reject_test");
    const saved = (await db.query(call, args)).rows[0];
    assert.equal(saved.created, true);
    const again = (await db.query(call, args)).rows[0];
    assert.equal(again.created, false);
    assert.equal(again.project_id, saved.project_id);
    const final = (
      await db.query("select * from projects where id=$1", [saved.project_id])
    ).rows[0];
    assert.equal(final.title, payload.title);
    assert.equal(final.status, "open");
    assert.equal(final.pay_amount, 170000);
    assert.equal(final.selection_rounds, 3);
    assert.equal(
      (
        await db.query("select * from project_schedules where project_id=$1", [
          saved.project_id,
        ])
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select * from recruitment_channels where project_id=$1",
          [saved.project_id],
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select has_function_privilege('anon','register_project_intake_form(uuid,integer,uuid,jsonb,jsonb,jsonb)','execute') as permitted",
        )
      ).rows[0].permitted,
      false,
    );
  } finally {
    await db.close();
  }
});
