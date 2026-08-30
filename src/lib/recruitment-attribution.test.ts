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
