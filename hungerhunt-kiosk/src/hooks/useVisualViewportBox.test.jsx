import { afterEach, describe, expect, test } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useVisualViewportBox } from './useVisualViewportBox';

const Probe = ({ active }) => {
  const box = useVisualViewportBox(active);
  return <output>{box ? `${box.top}:${box.height}` : 'none'}</output>;
};

const installViewport = () => {
  const listeners = new Map();
  const viewport = {
    height: 800,
    offsetTop: 0,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    fire: (type) => listeners.get(type)?.(),
  };
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  return viewport;
};

afterEach(() => {
  cleanup();
  delete window.visualViewport;
});

describe('useVisualViewportBox', () => {
  test('stays unpinned while the viewport keeps its full height', () => {
    const viewport = installViewport();
    render(<Probe active />);

    act(() => viewport.fire('resize'));
    expect(screen.getByRole('status').textContent).toBe('none');
  });

  test('pins to the visible area when the keyboard eats the viewport', () => {
    const viewport = installViewport();
    render(<Probe active />);

    viewport.height = 420;
    viewport.offsetTop = 0;
    act(() => viewport.fire('resize'));
    expect(screen.getByRole('status').textContent).toBe('0:420');
  });

  test('releases the pin when the consumer goes inactive', () => {
    const viewport = installViewport();
    const { rerender } = render(<Probe active />);

    viewport.height = 420;
    act(() => viewport.fire('resize'));
    expect(screen.getByRole('status').textContent).toBe('0:420');

    rerender(<Probe active={false} />);
    expect(screen.getByRole('status').textContent).toBe('none');
  });
});
