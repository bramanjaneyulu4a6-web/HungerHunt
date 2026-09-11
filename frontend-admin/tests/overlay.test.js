// Every overlay on the console behaves the same way: Escape closes the one on
// top, and the page underneath stops scrolling while any of them is open.
//
// Mounted for real in a real DOM (helpers/dom.js) — the assertions are about
// what a browser actually does with a keydown and a body style.
import test, { afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';

import { installDom, pressEscape, pressKey } from './helpers/dom.js';

// Before React is imported: it reads the globals this installs.
installDom();

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { useDismissableOverlay } = await import('../src/utils/overlay.js');

/* A component that does nothing but register as an overlay, so the test drives
   the behaviour rather than any particular dialog's markup. */
const Overlay = ({ onDismiss, active }) => {
  useDismissableOverlay(onDismiss, { active });
  return React.createElement('div', null, 'overlay');
};

const roots = [];

const mount = (element) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  act(() => root.render(element));
  return {
    update: (next) => act(() => root.render(next)),
    unmount: () => act(() => root.unmount()),
  };
};

afterEach(() => {
  while (roots.length) {
    const { root, container } = roots.pop();
    act(() => root.unmount());
    container.remove();
  }
  document.body.style.overflow = '';
});

describe('an open overlay', () => {
  test('closes on Escape', () => {
    let dismissed = 0;
    mount(React.createElement(Overlay, { onDismiss: () => { dismissed += 1; } }));

    pressEscape();

    assert.equal(dismissed, 1);
  });

  test('ignores every other key', () => {
    let dismissed = 0;
    mount(React.createElement(Overlay, { onDismiss: () => { dismissed += 1; } }));

    pressKey('Enter');
    pressKey('a');

    assert.equal(dismissed, 0);
  });

  test('stops the page behind it scrolling, and gives the scroll back', () => {
    const overlay = mount(React.createElement(Overlay, { onDismiss: () => {} }));
    assert.equal(document.body.style.overflow, 'hidden');

    overlay.unmount();

    assert.equal(document.body.style.overflow, '');
  });

  test('restores whatever the page had before, not a blank value', () => {
    document.body.style.overflow = 'clip';
    const overlay = mount(React.createElement(Overlay, { onDismiss: () => {} }));
    assert.equal(document.body.style.overflow, 'hidden');

    overlay.unmount();

    assert.equal(document.body.style.overflow, 'clip');
  });

  test('does nothing at all while inactive', () => {
    let dismissed = 0;
    mount(React.createElement(Overlay, { onDismiss: () => { dismissed += 1; }, active: false }));

    pressEscape();

    assert.equal(dismissed, 0);
    assert.equal(document.body.style.overflow, '');
  });

  /* The handler is read fresh on every keypress. A dialog whose close depends
     on state — "not while a save is in flight" — would otherwise be dismissed
     by a stale closure captured when it opened. */
  test('uses the current handler, not the one it mounted with', () => {
    const calls = [];
    const overlay = mount(
      React.createElement(Overlay, { onDismiss: () => calls.push('first') })
    );
    overlay.update(React.createElement(Overlay, { onDismiss: () => calls.push('second') }));

    pressEscape();

    assert.deepEqual(calls, ['second']);
  });
});

/* A receipt opens on top of the student activity modal, and a confirmation can
   open on top of an editor. Escape must close the one in front. */
describe('one overlay on top of another', () => {
  test('Escape closes only the one in front', () => {
    const closed = [];
    mount(React.createElement(Overlay, { onDismiss: () => closed.push('under') }));
    const front = mount(React.createElement(Overlay, { onDismiss: () => closed.push('front') }));

    pressEscape();
    assert.deepEqual(closed, ['front']);

    // and with the front one gone, the next Escape reaches the one beneath
    front.unmount();
    pressEscape();
    assert.deepEqual(closed, ['front', 'under']);
  });

  test('the page stays locked until the last one closes', () => {
    const under = mount(React.createElement(Overlay, { onDismiss: () => {} }));
    const front = mount(React.createElement(Overlay, { onDismiss: () => {} }));

    front.unmount();
    assert.equal(document.body.style.overflow, 'hidden');

    under.unmount();
    assert.equal(document.body.style.overflow, '');
  });

  /* React does not promise to unmount siblings in the order they mounted, and
     a stack that restored on every close would hand back a stale value. */
  test('closing the underneath one first still gives the scroll back', () => {
    const under = mount(React.createElement(Overlay, { onDismiss: () => {} }));
    const front = mount(React.createElement(Overlay, { onDismiss: () => {} }));

    under.unmount();
    assert.equal(document.body.style.overflow, 'hidden');

    front.unmount();
    assert.equal(document.body.style.overflow, '');
  });
});
