import test from "node:test";
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
  } finally {
    await db.close();
  }
});
