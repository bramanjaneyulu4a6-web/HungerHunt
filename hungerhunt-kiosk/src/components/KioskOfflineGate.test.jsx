import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.stubGlobal('localStorage', (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})());

vi.mock('../utils/api', () => ({ default: { get: vi.fn() } }));
vi.mock('../constants/kioskMode', () => ({ LOGIN_DISABLED: false }));

const api = (await import('../utils/api')).default;
const KioskOfflineGate = (await import('./KioskOfflineGate')).default;

const OFFLINE = 'Kiosk is currently offline. Please check again later.';

const renderGate = () => render(
  <MemoryRouter initialEntries={['/']}>
    <KioskOfflineGate>
      <Routes>
        <Route path="/" element={<p>The till</p>} />
        <Route path="/login" element={<p>Sign in</p>} />
      </Routes>
    </KioskOfflineGate>
  </MemoryRouter>,
);

beforeEach(() => {
  localStorage.clear();
  api.get.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the kiosk offline gate', () => {
  test('shows the kiosk while it is open', async () => {
    api.get.mockResolvedValue({ data: { open: true } });
    renderGate();
    expect(await screen.findByText('The till')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/students/kiosk-status');
  });

  test('shows the offline message instead, and lets any session go', async () => {
    localStorage.setItem('kioskToken', 'token');
    localStorage.setItem('kioskStudent', '{"name":"Asha"}');
    api.get.mockResolvedValue({ data: { open: false, message: OFFLINE } });

    renderGate();

    expect(await screen.findByText(OFFLINE)).toBeTruthy();
    expect(screen.queryByText('The till')).toBeNull();
    expect(localStorage.getItem('kioskToken')).toBeNull();
    expect(localStorage.getItem('kioskStudent')).toBeNull();
  });

  test('a failed check leaves the kiosk open', async () => {
    api.get.mockRejectedValue(new Error('Network Error'));
    renderGate();
    await act(async () => {});
    expect(screen.getByText('The till')).toBeTruthy();
  });

  test('a server refusal takes it offline at once, without waiting for the next check', async () => {
    api.get.mockResolvedValue({ data: { open: true } });
    renderGate();
    await screen.findByText('The till');

    act(() => {
      window.dispatchEvent(new CustomEvent('kiosk-offline', { detail: { code: 'KIOSK_OFFLINE', message: OFFLINE } }));
    });

    expect(screen.getByText(OFFLINE)).toBeTruthy();
  });

  test('comes back by itself once switched on again', async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue({ data: { open: false, message: OFFLINE } });
    renderGate();
    await act(async () => {});
    expect(screen.getByText(OFFLINE)).toBeTruthy();

    api.get.mockResolvedValue({ data: { open: true } });
    await act(async () => { vi.advanceTimersByTime(60 * 1000); });

    expect(screen.getByText('The till')).toBeTruthy();
  });

  test('offers test students a way to sign in, and only when test accounts exist', async () => {
    api.get.mockResolvedValue({ data: { open: false, message: OFFLINE, testSignIn: true } });
    renderGate();

    fireEvent.click(await screen.findByText('Test account sign-in'));

    expect(screen.getByText('Sign in')).toBeTruthy();
  });

  test('no sign-in link when the server has no test accounts', async () => {
    api.get.mockResolvedValue({ data: { open: false, message: OFFLINE, testSignIn: false } });
    renderGate();
    await screen.findByText(OFFLINE);
    expect(screen.queryByText('Test account sign-in')).toBeNull();
  });

  test('a session the server does not call open is ended, a test session is kept', async () => {
    vi.useFakeTimers();
    localStorage.setItem('kioskToken', 'test-student-token');
    api.get.mockResolvedValue({ data: { open: true } });
    renderGate();
    await act(async () => {});
    expect(localStorage.getItem('kioskToken')).toBe('test-student-token');

    api.get.mockResolvedValue({ data: { open: false, message: OFFLINE, testSignIn: true } });
    await act(async () => { vi.advanceTimersByTime(60 * 1000); });

    expect(localStorage.getItem('kioskToken')).toBeNull();
    expect(screen.getByText(OFFLINE)).toBeTruthy();
  });

  test('the test sign-in screen has no time limit', async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue({ data: { open: false, message: OFFLINE, testSignIn: true } });
    renderGate();
    await act(async () => {});

    fireEvent.click(screen.getByText('Test account sign-in'));
    await act(async () => { vi.advanceTimersByTime(30 * 60 * 1000); });

    expect(screen.getByText('Sign in')).toBeTruthy();
  });
});
