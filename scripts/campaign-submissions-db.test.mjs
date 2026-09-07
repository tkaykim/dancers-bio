import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, ids, mutate } from "./campaign-submissions-test-db.mjs";

test("submission lifecycle executes against the actual migrations in isolated Postgres", async (t) => {
  const pg = await createTestDb();
  t.after(() => pg.close());
  await pg.exec("set role service_role");
  const cfg = {
    version: 0,
    enabled: true,
    board_id: ids.board,
    deadline: "2026-09-13T14:59:00Z",
    client_visible: false,
  };
  await t.test(
    "public roles cannot access private tables or actor RPC",
    async () => {
      const r = await pg.query(
        "select has_table_privilege('authenticated','campaign_participants','select') as read,has_function_privilege('anon','campaign_submission_mutate(uuid,uuid,text,jsonb)','execute') as call",
      );
      assert.equal(r.rows[0].read, false);
      assert.equal(r.rows[0].call, false);
      const policies = await pg.query(
        "select count(*)::int n from pg_policies where tablename like 'campaign_submission%' or tablename='campaign_participants'",
      );
      assert.equal(policies.rows[0].n, 0);
    },
  );
  await t.test(
    "unrelated users and cross-project boards are rejected",
    async () => {
      await assert.rejects(
        mutate(pg, ids.member, "configure", cfg),
        /CAMPAIGN_DENIED/,
      );
      await assert.rejects(
        mutate(pg, ids.admin, "configure", {
          ...cfg,
          board_id: ids.otherBoard,
        }),
        /CAMPAIGN_BOARD_MISMATCH/,
      );
      await mutate(pg, ids.manager, "configure", cfg);
    },
  );
  await t.test(
    "roster imports final confirmations and external members, never intermediate accepted",
    async () => {
      assert.equal((await mutate(pg, ids.admin, "sync", {})).added, 2);
      assert.equal((await mutate(pg, ids.admin, "sync", {})).added, 0);
    },
  );
  const people = (
    await pg.query("select * from campaign_participants order by display_name")
  ).rows;
  await t.test(
    "database guards reject cross-project participant and post links",
    async () => {
      await assert.rejects(
        pg.query(
          "insert into campaign_participants(project_id,board_member_id,display_name) values($1,$2,'wrong')",
          [ids.otherProject, ids.memberBoard],
        ),
        /CAMPAIGN_BOARD_MISMATCH/,
      );
      await assert.rejects(
        pg.query(
          "insert into campaign_participants(project_id,application_id,dancer_id,display_name) values($1,$2,$3,'wrong')",
          [ids.otherProject, ids.app, ids.dancer],
        ),
        /CAMPAIGN_APPLICATION_MISMATCH/,
      );
    },
  );
  const person = people.find((p) => p.dancer_id === ids.dancer),
    external = people.find((p) => !p.dancer_id);
  const submit = (code, extra = {}) => ({
    participant_id: person.id,
    url: `https://www.instagram.com/reel/${code}/`,
    short_code: code,
    ...extra,
  });
  let submission;
  await t.test(
    "ownership and URL checks reject forged submission without side effects",
    async () => {
      await assert.rejects(
        mutate(pg, ids.other, "submit", submit("a")),
        /CAMPAIGN_DENIED/,
      );
      await assert.rejects(
        mutate(
          pg,
          ids.member,
          "submit",
          submit("a", { participant_id: external.id }),
        ),
        /CAMPAIGN_DENIED/,
      );
      await assert.rejects(
        mutate(
          pg,
          ids.member,
          "submit",
          submit("a", { url: "https://evil.test/a" }),
        ),
        /CAMPAIGN_INVALID_URL/,
      );
      assert.equal(
        (await pg.query("select count(*)::int n from campaign_posts")).rows[0]
          .n,
        0,
      );
    },
  );
  await t.test(
    "admin proxy registration is visible to owner, duplicate submit is idempotent",
    async () => {
      submission = (
        await mutate(pg, ids.admin, "submit", submit("Dc-2MpLTvXV"))
      ).id;
      assert.equal(
        (await mutate(pg, ids.member, "submit", submit("Dc-2MpLTvXV")))
          .duplicate,
        true,
      );
      const row = (
        await pg.query("select * from campaign_submissions where id=$1", [
          submission,
        ])
      ).rows[0];
      assert.equal(row.source, "admin");
      assert.equal(row.status, "pending_review");
      assert.equal(
        (await pg.query("select count(*)::int n from campaign_posts")).rows[0]
          .n,
        1,
      );
    },
  );
  await t.test(
    "approval requires review checks; stale or missing versions fail",
    async () => {
      await assert.rejects(
        mutate(pg, ids.member, "review", {
          submission_id: submission,
          version: 1,
          status: "approved",
        }),
        /CAMPAIGN_DENIED/,
      );
      await assert.rejects(
        mutate(pg, ids.admin, "review", {
          submission_id: submission,
          version: 1,
          status: "approved",
        }),
        /CAMPAIGN_CHECKS_REQUIRED/,
      );
      await assert.rejects(
        mutate(pg, ids.admin, "review", {
          submission_id: submission,
          version: 1,
          status: "changes_requested",
        }),
        /CAMPAIGN_FEEDBACK_REQUIRED/,
      );
      await mutate(pg, ids.admin, "review", {
        submission_id: submission,
        version: 1,
        status: "approved",
        checks: { public: true, account: true, guidelines: true },
      });
      await assert.rejects(
        mutate(pg, ids.admin, "review", {
          submission_id: submission,
          version: 1,
          status: "changes_requested",
          feedback: "old",
        }),
        /CAMPAIGN_STALE/,
      );
      await assert.rejects(
        mutate(pg, ids.admin, "participant", {
          participant_id: person.id,
          dancer_id: ids.dancer,
        }),
        /CAMPAIGN_STALE/,
      );
    },
  );
  await t.test(
    "replacement is atomic, removes live approval and preserves old record",
    async () => {
      await assert.rejects(
        mutate(
          pg,
          ids.member,
          "submit",
          submit("replacement", { replace_id: submission, version: 1 }),
        ),
        /CAMPAIGN_STALE/,
      );
      assert.equal(
        (
          await pg.query(
            "select count(*)::int n from campaign_posts where short_code='replacement'",
          )
        ).rows[0].n,
        0,
      );
      const next = (
        await mutate(
          pg,
          ids.member,
          "submit",
          submit("replacement", { replace_id: submission, version: 2 }),
        )
      ).id;
      const old = (
        await pg.query("select * from campaign_submissions where id=$1", [
          submission,
        ])
      ).rows[0];
      assert.ok(old.replaced_at);
      assert.equal(old.status, "approved");
      submission = next;
      assert.equal(
        (
          await pg.query(
            "select status from campaign_submissions where id=$1",
            [next],
          )
        ).rows[0].status,
        "pending_review",
      );
    },
  );
  await t.test(
    "same URL correction reuses post and creates audit event",
    async () => {
      await mutate(pg, ids.admin, "review", {
        submission_id: submission,
        version: 1,
        status: "changes_requested",
        feedback: "태그를 확인해 주세요.",
      });
      await mutate(
        pg,
        ids.member,
        "submit",
        submit("replacement", { replace_id: submission, version: 2 }),
      );
      const row = (
        await pg.query("select * from campaign_submissions where id=$1", [
          submission,
        ])
      ).rows[0];
      assert.equal(row.status, "pending_review");
      assert.equal(row.version, 3);
      assert.equal(row.feedback, "");
      const events = (
        await pg.query(
          "select detail from campaign_submission_events where submission_id=$1",
          [submission],
        )
      ).rows;
      assert.ok(
        events.some(
          (e) => e.detail.previous?.feedback === "태그를 확인해 주세요.",
        ),
      );
    },
  );
  await t.test(
    "external participant may be linked by staff, shared posts require staff review",
    async () => {
      await assert.rejects(
        mutate(pg, ids.admin, "participant", {
          participant_id: external.id,
          version: 1,
          dancer_id: ids.otherDancer,
        }),
        /CAMPAIGN_LINK_REASON/,
      );
      await mutate(pg, ids.admin, "participant", {
        participant_id: external.id,
        version: 1,
        dancer_id: ids.otherDancer,
        link_reason: "본인 연락 확인",
      });
      await assert.rejects(
        mutate(
          pg,
          ids.other,
          "submit",
          submit("replacement", { participant_id: external.id }),
        ),
        /CAMPAIGN_COLLAB_REVIEW/,
      );
      await mutate(
        pg,
        ids.admin,
        "submit",
        submit("replacement", { participant_id: external.id }),
      );
      assert.equal(
        (
          await pg.query(
            "select count(*)::int n from campaign_posts where short_code='replacement'",
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await pg.query(
            "select count(*)::int n from campaign_submissions s join campaign_posts p on p.id=s.post_id where p.short_code='replacement' and s.replaced_at is null",
          )
        ).rows[0].n,
        2,
      );
    },
  );
  await t.test(
    "withdrawn application, inactive roster and disabled campaign block self submits",
    async () => {
      await pg.exec("reset role");
      await pg.query("update applications set status='withdrawn' where id=$1", [
        ids.app,
      ]);
      await assert.rejects(
        mutate(pg, ids.member, "submit", submit("after-withdraw")),
        /CAMPAIGN_DENIED/,
      );
      await pg.query("update applications set status='accepted' where id=$1", [
        ids.app,
      ]);
      await pg.exec("set role service_role");
      await mutate(pg, ids.admin, "participant", {
        participant_id: person.id,
        version: 1,
        dancer_id: ids.dancer,
        active: false,
      });
      await assert.rejects(
        mutate(pg, ids.admin, "submit", submit("after-inactive")),
        /CAMPAIGN_DENIED/,
      );
      await mutate(pg, ids.admin, "configure", {
        ...cfg,
        version: 1,
        enabled: false,
      });
      await assert.rejects(
        mutate(
          pg,
          ids.other,
          "submit",
          submit("disabled", { participant_id: external.id }),
        ),
        /CAMPAIGN_DENIED/,
      );
    },
  );
});
test("budget RPC restricts full finance, allows manager fees, and enforces versions, scope and audit", async () => {
  const pg = await createTestDb();
  try {
    await mutate(pg, ids.admin, "configure", {version:0,enabled:true,board_id:ids.board});
    await mutate(pg, ids.admin, "sync", {});
    const person=(await pg.query("select id from campaign_participants where dancer_id=$1",[ids.dancer])).rows[0];
    await pg.exec("set role service_role");
    const budget=(actor,action,data,project=ids.project)=>pg.query("select campaign_budget_mutate($1,$2,$3,$4)",[project,actor,action,JSON.stringify(data)]);
    await assert.rejects(budget(ids.manager,"configure",{version:0,total_amount:1000000,basis:"source"}),/CAMPAIGN_DENIED/);
    await assert.rejects(budget(ids.member,"configure",{version:0,total_amount:1000000,basis:"source"}),/CAMPAIGN_DENIED/);
    await budget(ids.admin,"configure",{version:0,total_amount:1000000,basis:"source"});
    await assert.rejects(budget(ids.admin,"configure",{version:0,total_amount:1000000,basis:"source"}),/CAMPAIGN_STALE/);
    await assert.rejects(budget(ids.admin,"fee",{participant_id:person.id,version:0,amount:100000,status:"agreed",note:"source"},ids.otherProject),/CAMPAIGN_DENIED/);
    await assert.rejects(budget(ids.admin,"fee",{participant_id:person.id,version:0,amount:-1,status:"agreed",note:"source"}),/check constraint/);
    await budget(ids.admin,"fee",{participant_id:person.id,version:0,amount:100000,status:"agreed",note:"합의"});
    await assert.rejects(budget(ids.member,"fee",{participant_id:person.id,version:1,amount:0,status:"agreed",note:"forged"}),/CAMPAIGN_DENIED/);
    await budget(ids.manager,"fee",{participant_id:person.id,version:1,amount:0,status:"agreed",note:"무료 변경 합의"});
    const audit=(await pg.query("select detail from campaign_budget_events where action='fee' order by created_at desc limit 1")).rows[0];
    assert.equal(audit.detail.previous.amount,100000);
    await pg.exec("set role anon");
    await assert.rejects(pg.query("select * from campaign_budget_fees"),/permission denied/);
    await assert.rejects(budget(ids.admin,"configure",{version:1,basis:"forged"}),/permission denied/);
  } finally { await pg.close(); }
});
test("manual participants support missing and unclaimed profiles, safe linkage, budgets and submissions",async()=>{
  const pg=await createTestDb();
  try{
    await mutate(pg,ids.admin,"configure",{version:0,enabled:true,board_id:ids.board});
    await mutate(pg,ids.admin,"sync",{});
    await pg.exec("set role service_role");
    const manual=async(actor,data,project=ids.project)=>(await pg.query("select campaign_manual_participant($1,$2,$3) as result",[project,actor,JSON.stringify(data)])).rows[0].result;
    const input={request_id:"70000000-0000-4000-8000-000000000001",display_name:"수기 참여자",ig_handle:"manual_creator",note:"담당자 연락 확인"};
    await assert.rejects(manual(ids.member,input),/CAMPAIGN_DENIED/);
    await assert.rejects(manual(ids.manager,input,ids.otherProject),/CAMPAIGN_DENIED/);
    const person=await manual(ids.manager,input);
    assert.equal((await manual(ids.manager,input)).id,person.id);
    const saved=(await pg.query("select * from campaign_participants where id=$1",[person.id])).rows[0];
    assert.equal(saved.dancer_id,null);assert.equal(saved.client_visible,false);
    await assert.rejects(manual(ids.admin,{...input,request_id:"70000000-0000-4000-8000-000000000002"}),/CAMPAIGN_DUPLICATE_PERSON/);
    await pg.query("select campaign_budget_mutate($1,$2,'fee',$3)",[ids.project,ids.manager,JSON.stringify({participant_id:person.id,version:0,amount:150000,status:"estimate",note:"제안 금액"})]);
    const sub=await mutate(pg,ids.manager,"submit",{participant_id:person.id,url:"https://www.instagram.com/reel/manual/",short_code:"manual"});
    await assert.rejects(mutate(pg,ids.other,"submit",{participant_id:person.id,url:"https://www.instagram.com/reel/foreign/",short_code:"foreign"}),/CAMPAIGN_DENIED/);
    await manual(ids.manager,{...input,participant_id:person.id,version:1,dancer_id:ids.otherDancer,client_visible:true,note:"계정 본인 확인 후 연결"});
    await assert.rejects(manual(ids.manager,{...input,participant_id:person.id,version:1}),/CAMPAIGN_STALE/);
    await mutate(pg,ids.other,"submit",{participant_id:person.id,url:"https://www.instagram.com/reel/revised/",short_code:"revised",replace_id:sub.id,version:1});
    assert.equal((await pg.query("select amount from campaign_budget_fees where participant_id=$1",[person.id])).rows[0].amount,150000);
    assert.equal((await pg.query("select count(*)::int n from campaign_submission_events where participant_id=$1",[person.id])).rows[0].n,4);
    const unclaimed=await manual(ids.manager,{...input,request_id:"70000000-0000-4000-8000-000000000003",dancer_id:ids.unclaimedDancer,display_name:"미가입 프로필",ig_handle:"unclaimed_creator"});
    assert.ok(unclaimed.id);
    await assert.rejects(manual(ids.manager,{...input,request_id:"70000000-0000-4000-8000-000000000004",dancer_id:ids.otherDancer,ig_handle:"different_handle"}),/CAMPAIGN_DUPLICATE_PERSON/);
    await pg.exec("set role authenticated");
    await assert.rejects(manual(ids.admin,input),/permission denied/);
  }finally{await pg.close();}
});
