import test from "node:test";
import assert from "node:assert/strict";

import { filenameFromDisposition } from "./contentDisposition.js";

test("takes the server's filename when the header carries one", () => {
  assert.equal(
    filenameFromDisposition('attachment; filename="active-orders-2026-09-07-1650.pdf"', "sheet.pdf"),
    "active-orders-2026-09-07-1650.pdf"
  );
});

test("falls back when the header is absent or unreadable", () => {
  assert.equal(filenameFromDisposition(undefined, "sheet.pdf"), "sheet.pdf");
  assert.equal(filenameFromDisposition("attachment", "sheet.pdf"), "sheet.pdf");
});
