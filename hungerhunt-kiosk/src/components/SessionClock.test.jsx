import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import SessionClock from './SessionClock';

const stubViewport = (narrow) => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: narrow,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SessionClock', () => {
  test('wide screens get the numeric pill, not a button', () => {
    stubViewport(false);
    render(<SessionClock remaining={450} />);

    expect(screen.getByRole('timer').textContent).toContain('7:30');
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('narrow screens fold the timer into a tappable clock', () => {
    stubViewport(true);
    render(<SessionClock remaining={450} />);

    const clock = screen.getByRole('button');
    expect(clock.className).toContain('kiosk-session-clock--morph');
    expect(clock.className).not.toContain('kiosk-session-clock--peek');
  });

  test('the hand follows the remaining arc counter-clockwise as time runs down', () => {
    stubViewport(true);
    const { container, rerender } = render(<SessionClock remaining={75} total={100} />);

    const hand = container.querySelector('.kiosk-session-clock__hand');
    expect(hand.style.transform).toBe('rotate(270deg)');

    rerender(<SessionClock remaining={50} total={100} />);
    expect(hand.style.transform).toBe('rotate(180deg)');
  });

  test('a tap peeks the countdown for two seconds, then folds back', () => {
    vi.useFakeTimers();
    stubViewport(true);
    render(<SessionClock remaining={90} />);

    const clock = screen.getByRole('button');
    fireEvent.click(clock);
    expect(clock.className).toContain('kiosk-session-clock--peek');

    act(() => vi.advanceTimersByTime(1900));
    expect(clock.className).toContain('kiosk-session-clock--peek');

    act(() => vi.advanceTimersByTime(200));
    expect(clock.className).not.toContain('kiosk-session-clock--peek');
  });

  test('a second tap while open restarts the two seconds', () => {
    vi.useFakeTimers();
    stubViewport(true);
    render(<SessionClock remaining={90} />);

    const clock = screen.getByRole('button');
    fireEvent.click(clock);
    act(() => vi.advanceTimersByTime(1500));
    fireEvent.click(clock);
    act(() => vi.advanceTimersByTime(1500));
    expect(clock.className).toContain('kiosk-session-clock--peek');

    act(() => vi.advanceTimersByTime(600));
    expect(clock.className).not.toContain('kiosk-session-clock--peek');
  });

  test('the last thirty seconds read as a warning', () => {
    stubViewport(true);
    render(<SessionClock remaining={30} />);

    expect(screen.getByRole('button').className).toContain('kiosk-session-clock--warning');
  });
});
