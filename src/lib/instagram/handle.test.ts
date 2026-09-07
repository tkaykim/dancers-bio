import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeInstagramHandle,
  normalizeReelUrl,
  parseReelUrl,
} from "./handle";
test("handles share normalization for bare, @ and Instagram profiles", () => {
  for (const input of [
    "DANCER.One",
    "@Dancer.One",
    "https://www.instagram.com/Dancer.One/?igsh=x",
  ])
    assert.equal(normalizeInstagramHandle(input), "dancer.one");
  for (const input of [
    "",
    "not a handle",
    "https://example.com/dancer",
    "x".repeat(31),
  ])
    assert.equal(normalizeInstagramHandle(input), null);
});
test("reel paths normalize while preserving case-sensitive shortcodes", () => {
  for (const kind of ["reel", "reels", "p"])
    for (const end of ["", "/", "/?igsh=secret"])
      assert.deepEqual(
        parseReelUrl(`https://www.instagram.com/${kind}/AbC_9-x${end}`),
        {
          shortCode: "AbC_9-x",
          url: "https://www.instagram.com/reel/AbC_9-x/",
        },
      );
  for (const input of [
    "https://evil.com/reel/X",
    "https://instagram.com.evil.com/reel/X",
    "https://user:pass@instagram.com/reel/X",
    "https://instagram.com:123/reel/X",
    "https://instagram.com/reel/",
    "https://instagram.com/reel/X/extra",
    "javascript:alert(1)",
  ])
    assert.equal(normalizeReelUrl(input), null);
});
