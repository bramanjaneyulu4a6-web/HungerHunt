import assert from "node:assert/strict";
import test from "node:test";

import { blockFromHostel, groupOrdersByBlock } from "./orderGroups.js";

test("derives a block from common hostel codes", () => {
  assert.equal(blockFromHostel("D-4"), "D");
  assert.equal(blockFromHostel("B 10"), "B");
  assert.equal(blockFromHostel("A3"), "A");
});

test("groups student records into block and hostel work tiles", () => {
  const groups = groupOrdersByBlock([
    {
      id: "one",
      student: { hostelNumber: "D-10" },
      items: [{ productId: "pepsi", name: "Pepsi", quantity: 2 }],
      deliverBy: "2999-01-01",
    },
    {
      id: "two",
      student: { hostelNumber: "D-2" },
      items: [{ productId: "pepsi", name: "Pepsi", quantity: 3 }],
      deliverBy: "2999-01-01",
    },
    {
      id: "three",
      student: { hostelNumber: "D-2" },
      items: [{ productId: "chips", name: "Chips", quantity: 1 }],
      deliverBy: "2999-01-01",
    },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Block D");
  assert.equal(groups[0].itemCount, 6);
  assert.deepEqual(groups[0].hostels.map((hostel) => hostel.hostelNumber), ["D-2", "D-10"]);
  assert.equal(groups[0].hostels[0].orderCount, 2);
  assert.deepEqual(groups[0].hostels[0].items.map((item) => item.quantity), [1, 3]);
});
