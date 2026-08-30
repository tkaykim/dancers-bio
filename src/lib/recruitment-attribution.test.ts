import assert from "node:assert/strict";
import test from "node:test";
// Node 24's native TypeScript runner requires the extension at runtime.
// @ts-expect-error The project intentionally keeps allowImportingTsExtensions disabled.
import * as attribution from "./recruitment-attribution.ts";

const {
  chooseRecruitmentAttributionSource,
  normalizeRecruitmentShareCode,
  recruitmentAttributionCookieName,
  recruitmentChannelMatchesProject,
  resolveRecruitmentChannelDestination,
  shouldStoreRecruitmentAttributionCookie,
} = attribution;

test("URL의 채널 ID가 있으면 쿠키보다 우선한다", () => {
  assert.deepEqual(
    chooseRecruitmentAttributionSource({
      requestedChannelId: "channel-id",
      storedShareCode: "Svx2Rs",
    }),
    { kind: "id", value: "channel-id" },
  );
});

test("가입 흐름에서 URL 값이 사라지면 프로젝트 쿠키를 사용한다", () => {
  assert.deepEqual(
    chooseRecruitmentAttributionSource({
      requestedChannelId: null,
      storedShareCode: "Svx2Rs",
    }),
    { kind: "share_code", value: "Svx2Rs" },
  );
});

test("조작되거나 비정상적인 공유 코드는 무시한다", () => {
  assert.equal(normalizeRecruitmentShareCode("../../bad code"), null);
  assert.equal(
    chooseRecruitmentAttributionSource({
      requestedChannelId: null,
      storedShareCode: "../../bad code",
    }),
    null,
  );
});

test("활성 채널은 현재 또는 레거시 프로젝트가 일치할 때만 인정한다", () => {
  assert.equal(
    recruitmentChannelMatchesProject(
      { project_id: "project-a", legacy_project_id: null, status: "active" },
      "project-a",
    ),
    true,
  );
  assert.equal(
    recruitmentChannelMatchesProject(
      {
        project_id: "old-project",
        legacy_project_id: "project-a",
        status: "active",
      },
      "project-a",
    ),
    true,
  );
  assert.equal(
    recruitmentChannelMatchesProject(
      { project_id: "project-a", legacy_project_id: null, status: "paused" },
      "project-a",
    ),
    false,
  );
});

test("프로젝트마다 독립된 귀속 쿠키 이름을 만든다", () => {
  assert.equal(
    recruitmentAttributionCookieName("project-a"),
    "deetz_rc_project-a",
  );
  assert.notEqual(
    recruitmentAttributionCookieName("project-a"),
    recruitmentAttributionCookieName("project-b"),
  );
});

test("다른 유효 링크로 다시 들어오면 최신 채널로 교체한다", () => {
  assert.equal(
    shouldStoreRecruitmentAttributionCookie({
      storedShareCode: "first-channel",
      incomingShareCode: "second-channel",
    }),
    true,
  );
});

test("폐기되거나 조작된 기존 채널 쿠키는 새 유효 채널로 교체한다", () => {
  assert.equal(
    shouldStoreRecruitmentAttributionCookie({
      storedShareCode: "retired-channel",
      incomingShareCode: "active-channel",
    }),
    true,
  );
  assert.equal(
    shouldStoreRecruitmentAttributionCookie({
      storedShareCode: "../../bad code",
      incomingShareCode: "active-channel",
    }),
    true,
  );
});

test("쿠키가 없으면 저장하고 같은 채널이면 만료를 갱신하지 않는다", () => {
  assert.equal(
    shouldStoreRecruitmentAttributionCookie({
      storedShareCode: null,
      incomingShareCode: "active-channel",
    }),
    true,
  );
  assert.equal(
    shouldStoreRecruitmentAttributionCookie({
      storedShareCode: "active-channel",
      incomingShareCode: "active-channel",
    }),
    false,
  );
});

test("채널이 가리키는 활성 공고의 이동 목적지를 해석한다", async () => {
  const result = await resolveRecruitmentChannelDestination({
    shareCode: " Svx2Rs ",
    findChannel: async (shareCode) => ({
      project_id: "current-project",
      legacy_project_id: "legacy-project",
      share_code: shareCode,
      status: "active",
    }),
    findProject: async (projectId) => ({
      short_code: `${projectId}-short-code`,
      deleted_at: null,
    }),
  });

  assert.deepEqual(result, {
    projectId: "legacy-project",
    projectShortCode: "legacy-project-short-code",
    shareCode: "Svx2Rs",
  });
});

test("비정상·비활성 채널과 없거나 삭제된 공고는 이동시키지 않는다", async () => {
  const findProject = async () => ({ short_code: "project", deleted_at: null });
  assert.equal(
    await resolveRecruitmentChannelDestination({
      shareCode: "../../bad code",
      findChannel: async () => null,
      findProject,
    }),
    null,
  );
  assert.equal(
    await resolveRecruitmentChannelDestination({
      shareCode: "paused",
      findChannel: async (shareCode) => ({
        project_id: "project",
        legacy_project_id: null,
        share_code: shareCode,
        status: "paused",
      }),
      findProject,
    }),
    null,
  );
  assert.equal(
    await resolveRecruitmentChannelDestination({
      shareCode: "missing-project",
      findChannel: async (shareCode) => ({
        project_id: "project",
        legacy_project_id: null,
        share_code: shareCode,
        status: "active",
      }),
      findProject: async () => null,
    }),
    null,
  );
  assert.equal(
    await resolveRecruitmentChannelDestination({
      shareCode: "deleted-project",
      findChannel: async (shareCode) => ({
        project_id: "project",
        legacy_project_id: null,
        share_code: shareCode,
        status: "active",
      }),
      findProject: async () => ({
        short_code: "project",
        deleted_at: "2026-08-30T00:00:00.000Z",
      }),
    }),
    null,
  );
});
