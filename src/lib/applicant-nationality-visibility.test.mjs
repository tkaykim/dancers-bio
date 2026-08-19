import assert from "node:assert/strict";
import test from "node:test";

import { resolveApplicantNationalityAccess } from "./applicant-nationality-visibility.ts";

test("consented application always uses the submitted snapshot", () => {
  assert.equal(resolveApplicantNationalityAccess(true, false), "consented");
  assert.equal(resolveApplicantNationalityAccess(true, true), "consented");
});

test("only a platform admin can see current nationality without consent", () => {
  assert.equal(
    resolveApplicantNationalityAccess(false, true),
    "platform_admin",
  );
  assert.equal(
    resolveApplicantNationalityAccess(false, false),
    "not_disclosed",
  );
});
