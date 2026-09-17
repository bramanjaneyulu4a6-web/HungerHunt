import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

vi.mock('../utils/deployWatch', () => ({
  reloadIfDeployPending: vi.fn(() => false),
}));

const { reloadIfDeployPending } = await import('../utils/deployWatch');
const { isOrderSessionActive, setOrderSessionActive } = await import('../utils/kioskSession');
const { useOrderSession } = await import('./useOrderSession');

beforeEach(() => {
  setOrderSessionActive(false);
  reloadIfDeployPending.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('order session', () => {
  test('is not active until a till is on screen', () => {
    expect(isOrderSessionActive()).toBe(false);
  });

  test('is active for exactly as long as the till is mounted', () => {
    const { unmount } = renderHook(() => useOrderSession());
    expect(isOrderSessionActive()).toBe(true);
    unmount();
    expect(isOrderSessionActive()).toBe(false);
  });

  // The end of a session is the one moment a waiting deploy can land
  // without interrupting anybody — and, on the demo kiosk, the only one.
  test('ending the session lands a waiting deploy', () => {
    const { unmount } = renderHook(() => useOrderSession());
    expect(reloadIfDeployPending).not.toHaveBeenCalled();
    unmount();
    expect(reloadIfDeployPending).toHaveBeenCalledTimes(1);
  });

  test('starting a session never reloads', () => {
    setOrderSessionActive(true);
    expect(reloadIfDeployPending).not.toHaveBeenCalled();
  });
});
