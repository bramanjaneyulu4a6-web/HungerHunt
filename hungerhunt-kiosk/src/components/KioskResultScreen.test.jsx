import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import KioskResultScreen from './KioskResultScreen';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const noop = () => {};

/* The two ways a sale ends, as the student is told about them. Both are drawn
   by this one component, so what separates them is the copy passed in. */
describe('the endings', () => {
  test('a confirmed order says it in the heading and adds nothing under it', () => {
    const { container } = render(
      <KioskResultScreen variant="paid" mark="✓" kicker="All done" title="Order confirmed" body="" onDone={noop} />
    );

    expect(screen.getByText('Order confirmed')).toBeTruthy();
    // Not merely empty: absent. An empty paragraph still holds its margin and
    // would push the card off-centre against the approval ending beside it.
    expect(container.querySelector('.kiosk-result-card p:not(.kiosk-result-kicker)')).toBeNull();
  });

  test('the approval ending keeps its sentence, because "sent" alone does not say the money is safe', () => {
    render(
      <KioskResultScreen
        variant="pending"
        mark="⏳"
        kicker="Request sent"
        title="Sent to your parent"
        body="Nothing has been charged yet — your parent has been asked to approve it."
        onDone={noop}
      />
    );

    expect(screen.getByText(/Nothing has been charged yet/)).toBeTruthy();
  });
});

describe('leaving the screen', () => {
  test('a touch anywhere ends it rather than making the next student wait', () => {
    const onDone = vi.fn();
    const { container } = render(
      <KioskResultScreen variant="paid" mark="✓" kicker="All done" title="Order confirmed" body="" onDone={onDone} />
    );

    container.querySelector('.kiosk-result').click();

    expect(onDone).toHaveBeenCalled();
  });

  test('and it leaves on its own if nobody touches it', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(
      <KioskResultScreen variant="paid" mark="✓" kicker="All done" title="Order confirmed" body="" onDone={onDone} seconds={5} />
    );

    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(onDone).toHaveBeenCalled();
  });
});
