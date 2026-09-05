import assert from "node:assert/strict";
import test from "node:test";

import { blockFromRoom, groupOrdersByBlock } from "./orderGroups.js";

const orderIn = (id, roomNumber, roomId, items = [{ productId: "pepsi", name: "Pepsi", quantity: 1 }]) => ({
  id,
  student: { roomNumber, roomId },
  items,
  deliverBy: "2999-01-01",
});

test("derives a block from common room codes", () => {
  assert.equal(blockFromRoom("D-4"), "D");
  assert.equal(blockFromRoom("B 10"), "B");
  assert.equal(blockFromRoom("A3"), "A");
  assert.equal(blockFromRoom("MINDS-101"), "MINDS");
  assert.equal(blockFromRoom(""), "Other");
});

test("labels a single-room unit with its room code stripped of the block", () => {
  const blocks = groupOrdersByBlock(
    [orderIn("one", "MINDS-101", "r1")],
    [{ rooms: [{ id: "r1", code: "MINDS-101" }] }]
  );

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].label, "Block MINDS");
  assert.equal(blocks[0].unitCount, 1);
  assert.equal(blocks[0].units[0].label, "101");
  assert.deepEqual(blocks[0].units[0].roomNumbers, ["MINDS-101"]);
  assert.equal(blocks[0].units[0].orderCount, 1);
});

test("gathers the rooms of one caretaker unit into a single tile", () => {
  const blocks = groupOrdersByBlock(
    [
      orderIn("one", "MINDS-101", "r1", [{ productId: "pepsi", name: "Pepsi", quantity: 2 }]),
      orderIn("two", "MINDS-102", "r2", [{ productId: "pepsi", name: "Pepsi", quantity: 3 }]),
      orderIn("three", "MINDS-102", "r2", [{ productId: "chips", name: "Chips", quantity: 1 }]),
    ],
    [{ rooms: [{ id: "r1", code: "MINDS-101" }, { id: "r2", code: "MINDS-102" }] }]
  );

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].unitCount, 1);
  assert.equal(blocks[0].orderCount, 3);
  assert.equal(blocks[0].itemCount, 6);

  const unit = blocks[0].units[0];
  assert.equal(unit.label, "101 · 102");
  assert.deepEqual(unit.roomNumbers, ["MINDS-101", "MINDS-102"]);
  assert.equal(unit.orderCount, 3);
  assert.equal(unit.itemCount, 6);
  assert.deepEqual(unit.items.map((item) => [item.name, item.quantity]), [["Chips", 1], ["Pepsi", 5]]);
});

test("keeps a room that is missing from the unit map as a unit of its own", () => {
  const blocks = groupOrdersByBlock(
    [orderIn("one", "MINDS-101", "r1"), orderIn("two", "MINDS-909", "r9")],
    [{ rooms: [{ id: "r1", code: "MINDS-101" }] }]
  );

  assert.equal(blocks[0].unitCount, 2);
  assert.deepEqual(blocks[0].units.map((unit) => unit.label), ["101", "909"]);
  assert.equal(blocks[0].orderCount, 2);
});

test("falls back to one unit per room when the unit map is empty or missing", () => {
  const orders = [orderIn("one", "D-2", "r1"), orderIn("two", "D-10", "r2"), orderIn("three", "D-2", "r1")];

  for (const blocks of [groupOrdersByBlock(orders), groupOrdersByBlock(orders, []), groupOrdersByBlock(orders, undefined)]) {
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].unitCount, 2);
    assert.deepEqual(blocks[0].units.map((unit) => unit.label), ["2", "10"]);
    assert.equal(blocks[0].units[0].orderCount, 2);
  }
});

test("files a unit whose rooms span two blocks under its lowest room code", () => {
  const blocks = groupOrdersByBlock(
    [orderIn("one", "B-7", "r2"), orderIn("two", "A-3", "r1")],
    [{ rooms: [{ id: "r2", code: "B-7" }, { id: "r1", code: "A-3" }] }]
  );

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].key, "A");
  assert.equal(blocks[0].label, "Block A");
  assert.equal(blocks[0].units[0].label, "3 · B-7");
});

test("collects rooms with no code into the Other rooms bucket", () => {
  const blocks = groupOrdersByBlock([orderIn("one", "", null), orderIn("two", "A-1", "r1")], []);

  const other = blocks.find((block) => block.key === "Other");
  assert.equal(other.label, "Other rooms");
  assert.equal(other.unitCount, 1);
  assert.equal(other.units[0].label, "Unassigned");
});

test("orders blocks and unit labels naturally rather than as text", () => {
  const blocks = groupOrdersByBlock(
    [
      orderIn("one", "MINDS-1010", "r2"),
      orderIn("two", "MINDS-101", "r1"),
      orderIn("three", "A-10", "r3"),
      orderIn("four", "A-2", "r4"),
    ],
    []
  );

  assert.deepEqual(blocks.map((block) => block.key), ["A", "MINDS"]);
  assert.deepEqual(blocks[0].units.map((unit) => unit.label), ["2", "10"]);
  assert.deepEqual(blocks[1].units.map((unit) => unit.label), ["101", "1010"]);
});

test("marks a unit overdue when any of its orders is past its deliver-by time", () => {
  const blocks = groupOrdersByBlock(
    [orderIn("one", "A-1", "r1"), { ...orderIn("two", "A-2", "r2"), deliverBy: "2000-01-01" }],
    [{ rooms: [{ id: "r1", code: "A-1" }, { id: "r2", code: "A-2" }] }]
  );

  assert.equal(blocks[0].units[0].overdue, true);
});
