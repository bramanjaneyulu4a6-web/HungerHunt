import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useKeepFocusedInView } from './useKeepFocusedInView';

const Probe = ({ active = true }) => {
  useKeepFocusedInView(active);
  return (
    <>
      <input aria-label="first" />
      <input aria-label="second" />
    </>
  );
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

// jsdom has no layout, so nothing implements this.
const spyScroll = () => {
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  return scrollIntoView;
};

afterEach(() => {
  cleanup();
  delete window.visualViewport;
});

describe('useKeepFocusedInView', () => {
  test('brings the focused field up when the keyboard takes the viewport', () => {
    const viewport = installViewport();
    const scrollIntoView = spyScroll();
    render(<Probe />);

    screen.getByLabelText('first').focus();
    viewport.height = 420;
    act(() => viewport.fire('resize'));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
  });

  test('leaves the page alone when the viewport only lost browser chrome', () => {
    const viewport = installViewport();
    const scrollIntoView = spyScroll();
    render(<Probe />);

    screen.getByLabelText('first').focus();
    viewport.height = 760;
    act(() => viewport.fire('resize'));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  test('does nothing when no field is focused', () => {
    const viewport = installViewport();
    const scrollIntoView = spyScroll();
    render(<Probe />);

    viewport.height = 420;
    act(() => viewport.fire('resize'));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  /* Moving between form fields does not resize anything, so a
     resize-only hook would centre the first box and then sit still while the
     student typed their way down to one behind the keys. */
  test('follows focus to the next field while the keyboard stays up', () => {
    const viewport = installViewport();
    const scrollIntoView = spyScroll();
    render(<Probe />);

    screen.getByLabelText('first').focus();
    viewport.height = 420;
    act(() => viewport.fire('resize'));
    scrollIntoView.mockClear();

    // .focus() dispatches focusin itself; firing one by hand as well would
    // count the same move twice.
    act(() => screen.getByLabelText('second').focus());

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  /* scrollIntoView moves the visual viewport, which fires 'scroll', which
     would scroll again — the reason this reacts to the keyboard arriving and
     to focus moving, rather than to every measurement. */
  test('does not chase its own scrolling', () => {
    const viewport = installViewport();
    const scrollIntoView = spyScroll();
    render(<Probe />);

    screen.getByLabelText('first').focus();
    viewport.height = 420;
    act(() => viewport.fire('resize'));
    scrollIntoView.mockClear();

    act(() => viewport.fire('scroll'));
    act(() => viewport.fire('scroll'));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  test('stays out of the way when inactive', () => {
    const viewport = installViewport();
    const scrollIntoView = spyScroll();
    render(<Probe active={false} />);

    screen.getByLabelText('first').focus();
    viewport.height = 420;
    act(() => viewport.fire('resize'));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
