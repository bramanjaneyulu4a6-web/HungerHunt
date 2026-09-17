import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

/* jsdom does not hand this environment a localStorage, and the kiosk keeps its
   whole session in one. A map is enough: nothing here tests the browser. */
vi.stubGlobal('localStorage', (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})());

vi.mock('./utils/api', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}));

vi.mock('./utils/dataAutoRefresh', () => ({
  startDataAutoRefresh: vi.fn(() => () => {}),
  observeMutationRevision: (response) => response,
}));

vi.mock('./utils/deployWatch', () => ({
  startDeployWatch: vi.fn(() => () => {}),
  reloadIfDeployPending: vi.fn(() => false),
}));

/* The till itself is a thousand lines about baskets and money, and none of it
   is what these tests are about: they are about who gets as far as it. */
vi.mock('./pages/KioskBilling', () => ({
  default: ({ student, onLogout }) => (
    <div>
      <p>Till for {student.name}</p>
      <button type="button" onClick={onLogout}>End session</button>
    </div>
  ),
}));

const api = (await import('./utils/api')).default;

const DEMO_STUDENT = {
  id: 'demo-id',
  name: 'Demo Student',
  admissionNumber: 'DEMO01',
  pocketMoney: 3000,
  requiresParentApproval: false,
  demo: true,
};

const renderAppAt = async (path = '/') => {
  window.history.pushState({}, '', path);
  const { default: App } = await import('./App');
  return render(<App />);
};

beforeEach(() => {
  localStorage.clear();
  api.post.mockReset();
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

/* The kiosk as it normally stands: a gate that asks whose session this is. */
describe('with the login gate in place', () => {
  // Pinned rather than inherited: the committed .env carries whatever the
  // kiosk currently ships, and this group is about the other setting.
  beforeEach(() => {
    vi.stubEnv('VITE_KIOSK_LOGIN_DISABLED', 'false');
  });

  test('a terminal with no session is sent to the gate, and asks nobody for a session on its own', async () => {
    await renderAppAt('/');

    expect(await screen.findByLabelText('Admission number')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });
});

/* VITE_KIOSK_LOGIN_DISABLED=true: the terminal stops asking who is standing at
   it and drives the demo student instead. Nothing it does downstream is
   written — that is settled on the server by Student.demoAccount, not here. */
describe('with the login gate switched off', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_KIOSK_LOGIN_DISABLED', 'true');
    api.post.mockResolvedValue({ data: { token: 'demo-token', student: DEMO_STUDENT } });
  });

  test('opening the kiosk lands on the till, having started a demo session by itself', async () => {
    await renderAppAt('/');

    expect(await screen.findByText('Till for Demo Student')).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith('/students/kiosk-session', {
      admissionNumber: 'DEMO01',
    });
    expect(screen.queryByLabelText('Admission number')).toBeNull();
  });

  test('the till never polls the change counter — nothing on it would act on the answer', async () => {
    await renderAppAt('/');
    await screen.findByText('Till for Demo Student');

    // Same module registry the App just imported from, so this is the very
    // mock App would have called.
    const { startDataAutoRefresh } = await import('./utils/dataAutoRefresh');
    expect(startDataAutoRefresh).not.toHaveBeenCalled();
  });

  test('watches for new deploys, but never lets one reload an order session', async () => {
    const { startDeployWatch } = await import('./utils/deployWatch');
    startDeployWatch.mockClear();

    await renderAppAt('/');
    await screen.findByText('Till for Demo Student');

    const { setOrderSessionActive } = await import('./utils/kioskSession');
    expect(startDeployWatch).toHaveBeenCalledTimes(1);
    const [{ canReload }] = startDeployWatch.mock.calls[0];

    setOrderSessionActive(true);
    expect(canReload()).toBe(false);
    setOrderSessionActive(false);
    expect(canReload()).toBe(true);
  });

  test('the gate is unreachable even by asking for it directly', async () => {
    await renderAppAt('/login');

    expect(await screen.findByText('Till for Demo Student')).toBeTruthy();
    expect(screen.queryByLabelText('Admission number')).toBeNull();
    expect(window.location.pathname).toBe('/');
  });

  /* A tablet that was serving real students when the flag was built in still
     has the last one's token in localStorage. Reusing it would put a child's
     wallet on screen with nobody having signed in. */
  test('a session left over from before the switch is thrown away, not resumed', async () => {
    localStorage.setItem('kioskToken', 'a-real-students-token');
    localStorage.setItem('kioskStudent', JSON.stringify({ name: 'A Real Child', demo: false }));

    await renderAppAt('/');

    expect(await screen.findByText('Till for Demo Student')).toBeTruthy();
    expect(screen.queryByText('Till for A Real Child')).toBeNull();
    expect(localStorage.getItem('kioskToken')).toBe('demo-token');
  });

  /* The whole promise of this mode is that nothing is recorded, and the only
     thing keeping that promise is demoAccount on the row the server answered
     with. A terminal with no gate must not open for anyone else. */
  test('a session that comes back without the demo flag is refused rather than served', async () => {
    api.post.mockResolvedValue({
      data: { token: 'real-token', student: { ...DEMO_STUDENT, demo: false } },
    });

    await renderAppAt('/');

    expect(await screen.findByText(/Sorry, please try again later/)).toBeTruthy();
    expect(screen.queryByText('Till for Demo Student')).toBeNull();
    expect(localStorage.getItem('kioskToken')).toBeNull();
  });

  test('a backend that cannot be reached says so rather than showing an empty till', async () => {
    api.post.mockRejectedValue(new Error('offline'));

    await renderAppAt('/');

    expect(await screen.findByText(/Sorry, please try again later/)).toBeTruthy();
    expect(localStorage.getItem('kioskToken')).toBeNull();
  });

  /* Done, the hard cap and a finished sale all come through onLogout. With no
     gate to return to, the next visitor's session starts where the last one
     ended: on the selection screen. */
  test('ending a session opens the next one instead of returning to a gate', async () => {
    const { findByText } = await renderAppAt('/');

    fireEvent.click(await findByText('End session'));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Till for Demo Student')).toBeTruthy();
    expect(screen.queryByLabelText('Admission number')).toBeNull();
  });
});
