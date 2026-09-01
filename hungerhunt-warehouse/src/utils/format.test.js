import assert from "node:assert/strict";
import test from "node:test";

import { formatPackSize } from "./format.js";

test("formats an individual item's size independently of stock", () => {
  assert.equal(formatPackSize(200, "ml"), "200 ml");
  assert.equal(formatPackSize(1, "L"), "1 L");
});

test("does not invent a size for legacy products with incomplete data", () => {
  assert.equal(formatPackSize(null, "ml"), "");
  assert.equal(formatPackSize(200, null), "");
});
