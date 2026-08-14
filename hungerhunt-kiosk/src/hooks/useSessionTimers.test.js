/* The two clocks that end a session.
 *
 * Worth testing properly because they fail quietly: nothing looks wrong until
 * a terminal in a corridor sits on somebody's logged-in wallet all afternoon,
 * or throws a child out mid-order every minute. Neither shows up in a
 * screenshot, and both are hard to notice by hand — the cap alone takes seven
 * and a half minutes to observe once.
 *
 * Fake clocks throughout, so the whole session takes milliseconds.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import {
  useSessionTimers,
  HARD_CAP_SECONDS,
  WARNING_SECONDS,
  IDLE_SECONDS,
  PROMPT_SECONDS,
} from './useSessionTimers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const tick = (seconds) => act(() => vi.advanceTimersByTime(seconds * 1000));
const touch = () => act(() => { window.dispatchEvent(new Event('pointerdown')); });

/* Advance the clock with the student still present — a touch every ten
   seconds — so the idle prompt stays out of tests that are about the cap.
   Without this a "does the cap fire at 7:30" test would really be watching the
   idle timer end the session at 1:10. */
const tickPresent = (seconds) => {
  for (let left = seconds; left > 0; left -= 10) {
    tick(Math.min(10, left));
    touch();
  }
};

const start = (overrides = {}) => {
  const onExpire = vi.fn();
  const hook = renderHook(() =>
    useSessionTimers({ active: true, onExpire, isBusy: () => false, ...overrides })
  );

  return { onExpire, ...hook };
};

describe('the hard cap', () => {
  test('is seven and a half minutes, and warns for the last thirty seconds', () => {
    const { result, onExpire } = start();

    expect(HARD_CAP_SECONDS).toBe(450);
    expect(WARNING_SECONDS).toBe(30);

    tickPresent(419);
    expect(result.current.capWarning).toBe(false);

    tickPresent(2); // 7:01
    expect(result.current.capWarning).toBe(true);
    expect(onExpire).not.toHaveBeenCalled();

    tickPresent(29); // 7:30
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  // The point of the cap. An idle timer alone would let somebody keep a
  // terminal — and a wallet — open indefinitely by touching it.
  test('activity does not extend it', () => {
    const { onExpire } = start();

    tickPresent(450);
    expect(onExpire).toHaveBeenCalled();
  });

  test('fires once, not once per tick', () => {
    const { onExpire } = start();

    tickPresent(470);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  /* The one exception. If the cap lands while a bill is in flight, ending the
     session there would move the money and tell nobody. So it waits for the
     answer — and not a second past it. */
  test('waits for an in-flight bill, then ends', () => {
    let busy = true;
    const { onExpire } = start({ isBusy: () => busy });

    tick(450);
    expect(onExpire).not.toHaveBeenCalled();

    tick(30);
    expect(onExpire).not.toHaveBeenCalled();

    busy = false;
    tick(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});

describe('the idle prompt', () => {
  test('appears after one quiet minute', () => {
    const { result } = start();

    tick(59);
    expect(result.current.idlePrompt).toBe(false);

    tick(1);
    expect(result.current.idlePrompt).toBe(true);
    expect(IDLE_SECONDS).toBe(60);
  });

  test('a touch dismisses it and the session goes on', () => {
    const { result, onExpire } = start();

    tick(60);
    expect(result.current.idlePrompt).toBe(true);

    touch();
    expect(result.current.idlePrompt).toBe(false);
    expect(onExpire).not.toHaveBeenCalled();
  });

  test('ignored for ten seconds, it ends the session', () => {
    const { result, onExpire } = start();

    tick(60);
    expect(result.current.idlePrompt).toBe(true);
    expect(PROMPT_SECONDS).toBe(10);

    tick(9);
    expect(onExpire).not.toHaveBeenCalled();

    tick(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test('counts down visibly while it waits', () => {
    const { result } = start();

    tick(60);
    expect(result.current.idleRemaining).toBe(10);

    tick(4);
    expect(result.current.idleRemaining).toBe(6);
  });

  // Typing in the item search is being there, even though nothing is tapped.
  test('keystrokes count as being present', () => {
    const { result } = start();

    tick(50);
    act(() => { window.dispatchEvent(new Event('keydown')); });
    tick(50);

    expect(result.current.idlePrompt).toBe(false);
  });

  // Dismissing restarts the quiet count rather than resuming it, or a student
  // who tapped once would get the prompt again a second later.
  test('the quiet count starts over after a dismissal', () => {
    const { result } = start();

    tick(60);
    touch();

    tick(59);
    expect(result.current.idlePrompt).toBe(false);

    tick(1);
    expect(result.current.idlePrompt).toBe(true);
  });
});

describe('when the session is over', () => {
  // The result screen. Throwing a "still there?" over somebody's receipt would
  // be asking about a session that has already ended.
  test('nothing runs while inactive', () => {
    const { onExpire } = start({ active: false });

    tick(500);
    expect(onExpire).not.toHaveBeenCalled();
  });

  test('the clocks are let go on unmount', () => {
    const { onExpire, unmount } = start();

    unmount();
    tick(500);

    expect(onExpire).not.toHaveBeenCalled();
  });
});
