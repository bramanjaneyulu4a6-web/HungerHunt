import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

/* jsdom does not hand this environment a localStorage, and the till keeps its
   menu snapshot in one. A map is enough: nothing here tests the browser. */
vi.stubGlobal('localStorage', (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})());

vi.mock('../utils/api', () => ({
  default: {
    get: vi.fn((url) => {
      if (url === '/students/me/wallet') {
        return Promise.resolve({ data: { wallet: { balance: 0 } } });
      }
      if (url === '/inventory') {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn(),
  },
}));

vi.mock('../utils/deployWatch', () => ({
  reloadIfDeployPending: vi.fn(() => false),
}));

import KioskBilling from './KioskBilling';
import { isOrderSessionActive } from '../utils/kioskSession';
import { reloadIfDeployPending } from '../utils/deployWatch';

afterEach(() => {
  cleanup();
});

const STUDENT = {
  id: 'student-id',
  name: 'Test Student',
  admissionNumber: 'ADM0001',
  pocketMoney: 500,
  demo: false,
};

/* useOrderSession() is the first statement of KioskBilling's body, and
   nothing else fails if that line is removed — see
   src/hooks/useOrderSession.js and src/utils/kioskSession.js for why a
   mid-order deploy must never land. This is the test that catches it going
   missing: it renders the real till, not a stand-in for it. */
describe('the till itself holds the order session open', () => {
  test('is active for as long as KioskBilling is mounted, and lets a pending deploy in the moment it unmounts', () => {
    const { unmount } = render(
      <KioskBilling student={STUDENT} onLogout={() => {}} />
    );

    expect(isOrderSessionActive()).toBe(true);
    expect(reloadIfDeployPending).not.toHaveBeenCalled();

    unmount();

    expect(isOrderSessionActive()).toBe(false);
    expect(reloadIfDeployPending).toHaveBeenCalledTimes(1);
  });
});
