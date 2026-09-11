import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIMULATION_STEPS,
  completedSteps,
  routeDurationMs,
  simulationPhase,
} from './warehouseSimulation.js';

test('the route runs the same four steps the warehouse and caretaker do, in order', () => {
  assert.deepEqual(
    SIMULATION_STEPS.map((step) => step.status),
    ['PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COLLECTED']
  );
  // The parent app never says "collected": the student's code ending the
  // package is what the parent reads as delivered.
  assert.equal(SIMULATION_STEPS.at(-1).title, 'Delivered');
});

test('steps complete one at a time as the clock runs', () => {
  assert.equal(completedSteps(0, 100), 0);
  assert.equal(completedSteps(99, 100), 0);
  assert.equal(completedSteps(100, 100), 1);
  assert.equal(completedSteps(250, 100), 2);
  assert.equal(completedSteps(400, 100), 4);
});

test('the clock cannot run past the last step or before the first', () => {
  assert.equal(completedSteps(10_000, 100), SIMULATION_STEPS.length);
  assert.equal(completedSteps(-5, 100), 0);
  assert.equal(completedSteps(Number.NaN, 100), 0);
  assert.equal(completedSteps(500, 0), 0);
});

test('the route takes one step length per step', () => {
  assert.equal(routeDurationMs(100), 400);
});

test('the delivered screen waits for both the route and the reply', () => {
  const stepMs = 100;
  assert.equal(simulationPhase({ elapsedMs: 150, reply: null, stepMs }), 'running');
  // A fast reply does not cut the story short.
  assert.equal(simulationPhase({ elapsedMs: 150, reply: { ok: true }, stepMs }), 'running');
  // A finished route waits for the server before claiming anything.
  assert.equal(simulationPhase({ elapsedMs: 400, reply: null, stepMs }), 'settling');
  assert.equal(simulationPhase({ elapsedMs: 400, reply: { ok: true }, stepMs }), 'delivered');
});

test('a refusal ends the route wherever it is', () => {
  assert.equal(
    simulationPhase({ elapsedMs: 50, reply: { error: 'Only the PhonePe test account' }, stepMs: 100 }),
    'failed'
  );
});
