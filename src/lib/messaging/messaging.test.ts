import assert from "node:assert/strict";
import test from "node:test";
import {
  previewText,
  retryBackoffMinutes,
  slaTier,
  unreadMailIdemKey,
} from "./types";

test("retryBackoffMinutes: 첫 재시도 1분 → 4분 → 16분 (off-by-one 방지)", () => {
  assert.equal(retryBackoffMinutes(1), 1);
  assert.equal(retryBackoffMinutes(2), 4);
  assert.equal(retryBackoffMinutes(3), 16);
});

test("slaTier: 4시간 미만 ok / 4시간+ warn / 24시간+ late", () => {
  const now = Date.parse("2026-08-29T12:00:00Z");
  assert.equal(slaTier(null, now), "none");
  assert.equal(slaTier("2026-08-29T11:00:00Z", now), "ok");
  assert.equal(slaTier("2026-08-29T07:59:00Z", now), "warn");
  assert.equal(slaTier("2026-08-28T11:00:00Z", now), "late");
});

test("unreadMailIdemKey: 에피소드(첫 미읽음 seq)별로 고정된다", () => {
  assert.equal(unreadMailIdemKey("r1", 5), "unread_mail:r1:5");
  // 같은 에피소드에서 메시지가 더 와도 키가 같아 잡이 중복 생성되지 않는다.
  assert.equal(unreadMailIdemKey("r1", 5), unreadMailIdemKey("r1", 5));
  assert.notEqual(unreadMailIdemKey("r1", 5), unreadMailIdemKey("r1", 9));
});

test("previewText: 공백 정리 + 길이 제한 + 말줄임", () => {
  assert.equal(previewText("안녕하세요\n\n  잘   부탁드립니다"), "안녕하세요 잘 부탁드립니다");
  const long = "가".repeat(100);
  const cut = previewText(long, 10);
  assert.equal(cut.length, 10);
  assert.ok(cut.endsWith("…"));
});
