import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
export const ids = {
  project: "10000000-0000-4000-8000-000000000001",
  otherProject: "10000000-0000-4000-8000-000000000002",
  admin: "20000000-0000-4000-8000-000000000001",
  member: "20000000-0000-4000-8000-000000000002",
  other: "20000000-0000-4000-8000-000000000003",
  manager: "20000000-0000-4000-8000-000000000004",
  dancer: "30000000-0000-4000-8000-000000000001",
  otherDancer: "30000000-0000-4000-8000-000000000002",
  board: "40000000-0000-4000-8000-000000000001",
  otherBoard: "40000000-0000-4000-8000-000000000002",
  memberBoard: "50000000-0000-4000-8000-000000000001",
  externalBoard: "50000000-0000-4000-8000-000000000002",
  app: "60000000-0000-4000-8000-000000000001",
  otherApp: "60000000-0000-4000-8000-000000000002",
};
export async function createTestDb() {
  const pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table profiles(id uuid primary key,is_admin boolean default false,is_super_admin boolean default false,display_name text,avatar_url text,bio text,can_create_project boolean default false,is_verified_badge boolean default false,instagram_handle text,instagram_verified_at timestamptz);
    create table projects(id uuid primary key,owner_id uuid,title text,short_code text,deleted_at timestamptz);
    create table project_managers(project_id uuid,profile_id uuid);
    create table project_finances(project_id uuid,expense_amount integer);
    create table settlements(id uuid primary key,project_id uuid,dancer_id uuid,gross_amount integer,vat_amount integer default 0,role text,status text);
    create table dancers(id uuid primary key,profile_id uuid,stage_name text,social_links jsonb);
    create table applications(id uuid primary key,project_id uuid,dancer_id uuid,status text,confirmed_at timestamptz,archived_at timestamptz);
    create table casting_boards(id uuid primary key,project_id uuid,title text,share_code text);
    create table casting_board_members(id uuid primary key,board_id uuid,dancer_id uuid,application_id uuid,display_name text,ig_handle text,lineup_status text,expected_views integer);
    create function gen_project_survey_code() returns text language sql as $$ select substr(md5(random()::text),1,7); $$;
    insert into profiles(id,is_admin,is_super_admin,display_name) values ('${ids.admin}',true,true,'운영자'),('${ids.member}',false,false,'리우'),('${ids.other}',false,false,'다른 회원'),('${ids.manager}',false,false,'담당 매니저');
    insert into projects values('${ids.project}','${ids.admin}','글로벌 여성 솔로 아티스트 음원 챌린지','fixture',null),('${ids.otherProject}','${ids.other}','다른 프로젝트','other',null);
    insert into project_managers values('${ids.project}','${ids.manager}');
    insert into dancers values('${ids.dancer}','${ids.member}','리우','{"instagram":"diakang__"}'),('${ids.otherDancer}','${ids.other}','다른 회원','{}');
    insert into applications values('${ids.app}','${ids.project}','${ids.dancer}','accepted',now(),null),('${ids.otherApp}','${ids.project}','${ids.otherDancer}','accepted',null,null);
    insert into casting_boards values('${ids.board}','${ids.project}','확정 크리에이터 라인업','fixture'),('${ids.otherBoard}','${ids.otherProject}','다른 보드','other');
    insert into casting_board_members values('${ids.memberBoard}','${ids.board}','${ids.dancer}','${ids.app}','리우','diakang__','confirmed',10000),
      ('${ids.externalBoard}','${ids.board}',null,null,'직접 섭외 참여자','external_creator','confirmed',null),
      ('50000000-0000-4000-8000-000000000003','${ids.board}','${ids.otherDancer}','${ids.otherApp}','미확정 accepted','other','confirmed',null),
      ('50000000-0000-4000-8000-000000000004','${ids.board}',null,null,'협의 중','candidate','negotiating',null);
  `);
  await pg.exec(
    await fs.readFile(
      new URL(
        "../db/migrations/20260907_001_campaign_results.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    await fs.readFile(
      new URL(
        "../db/migrations/20260907133055_campaign_submissions.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    "grant select on profiles,projects,project_managers,dancers,applications,casting_boards,casting_board_members to service_role; grant update on projects to service_role;",
  );
  await pg.exec(await fs.readFile(new URL("../db/migrations/20260907150544_campaign_budget.sql",import.meta.url),"utf8"));
  await pg.exec("grant select on project_finances,settlements to service_role;");
  return pg;
}
export async function mutate(pg, actor, action, data, project = ids.project) {
  return (
    await pg.query("select campaign_submission_mutate($1,$2,$3,$4) as result", [
      project,
      actor,
      action,
      JSON.stringify(data),
    ])
  ).rows[0].result;
}
