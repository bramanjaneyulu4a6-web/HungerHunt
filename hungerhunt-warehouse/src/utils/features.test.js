import test from "node:test";
import assert from "node:assert/strict";

import { tabKey, visibleTabs } from "./features.js";

const TABS = [
  { to: "/", label: "Active" },
  { to: "/inventory", label: "Inventory" },
  { to: "/purchases", label: "Purchases" },
  { to: "/records", label: "Records" },
];

test("a tab is keyed as wh: plus its path", () => {
  assert.equal(tabKey("/records"), "wh:/records");
});

test("nothing hidden shows every tab", () => {
  assert.deepEqual(visibleTabs(TABS).map((tab) => tab.to), ["/", "/inventory", "/purchases", "/records"]);
  assert.deepEqual(visibleTabs(TABS, []).length, 4);
});

test("a hidden tab key removes exactly that tab", () => {
  const shown = visibleTabs(TABS, ["wh:/records", "warehouse.printOrders", "/records"]);
  assert.deepEqual(shown.map((tab) => tab.to), ["/", "/inventory", "/purchases"]);
});
