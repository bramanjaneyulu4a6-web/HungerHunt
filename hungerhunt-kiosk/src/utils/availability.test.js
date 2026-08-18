// The kiosk's side of the availability rule: LOW is still sellable —
// low is the office's problem, not the student's — and only OUT_OF_STOCK
// and ARCHIVED come off the menu. Falls back to the legacy stock>0 check
// against a backend that predates the availability field.
import { describe, expect, test } from 'vitest';
import { sellable } from './availability';

describe('sellable', () => {
  test('available and low items stay on the menu', () => {
    expect(sellable({ availability: 'AVAILABLE', stock: 20, productId: { _id: 'p' } })).toBe(true);
    expect(sellable({ availability: 'LOW', stock: 2, productId: { _id: 'p' } })).toBe(true);
  });

  test('out of stock and archived items come off it', () => {
    expect(sellable({ availability: 'OUT_OF_STOCK', stock: 0, productId: { _id: 'p' } })).toBe(false);
    expect(sellable({ availability: 'ARCHIVED', stock: 9, productId: { _id: 'p' } })).toBe(false);
  });

  test('without the field, the legacy check decides', () => {
    expect(sellable({ stock: 3, productId: { _id: 'p', active: true } })).toBe(true);
    expect(sellable({ stock: 0, productId: { _id: 'p', active: true } })).toBe(false);
    expect(sellable({ stock: 3, productId: { _id: 'p', active: false } })).toBe(false);
    // Absent active means the row predates the flag.
    expect(sellable({ stock: 3, productId: { _id: 'p' } })).toBe(true);
  });

  test('a row with no product is never sellable', () => {
    expect(sellable({ stock: 3, productId: null })).toBe(false);
  });
});
