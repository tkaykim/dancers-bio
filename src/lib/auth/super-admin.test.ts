import assert from "node:assert/strict";
import test from "node:test";
import { isSuperAdmin } from "./super-admin";

test("both admin flags grant super-admin access", () => {
  assert.equal(isSuperAdmin({ is_admin: true, is_super_admin: true }), true);
});

test("operating admins cannot access super-admin features", () => {
  assert.equal(isSuperAdmin({ is_admin: true, is_super_admin: false }), false);
  assert.equal(isSuperAdmin({ is_admin: true }), false);
  assert.equal(isSuperAdmin({ is_admin: true, is_super_admin: null }), false);
});

test("a super-admin flag without admin access is rejected", () => {
  assert.equal(isSuperAdmin({ is_admin: false, is_super_admin: true }), false);
});

test("ordinary users cannot access super-admin features", () => {
  assert.equal(isSuperAdmin({ is_admin: false, is_super_admin: false }), false);
});
