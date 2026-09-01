import { beforeEach, describe, expect, test } from 'vitest';

import { loadMenuSnapshot, saveMenuSnapshot } from './menuSnapshot';

// A self-contained localStorage stub — the util must survive environments
// where storage is absent, full, or holding garbage.
const store = new Map();
let failWrites = false;

beforeEach(() => {
  store.clear();
  failWrites = false;
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      if (failWrites) throw new Error('QuotaExceededError');
      store.set(key, String(value));
    },
  };
});

describe('the kiosk menu snapshot', () => {
  test('round-trips the menu rows', () => {
    const rows = [{ _id: 'p1', name: 'Apple Juice', price: 25, image: '' }];
    saveMenuSnapshot(rows);
    expect(loadMenuSnapshot()).toEqual(rows);
  });

  test('an empty store loads as an empty menu', () => {
    expect(loadMenuSnapshot()).toEqual([]);
  });

  test('garbage in storage loads as an empty menu, not a crash', () => {
    saveMenuSnapshot([{ _id: 'p1' }]);
    store.set([...store.keys()][0], '{not json');
    expect(loadMenuSnapshot()).toEqual([]);
  });

  test('a non-array in storage loads as an empty menu', () => {
    saveMenuSnapshot([{ _id: 'p1' }]);
    store.set([...store.keys()][0], '{"sneaky":"object"}');
    expect(loadMenuSnapshot()).toEqual([]);
  });

  test('a full or blocked store swallows the write', () => {
    failWrites = true;
    expect(() => saveMenuSnapshot([{ _id: 'p1' }])).not.toThrow();
  });
});
