/* A real DOM for tests that need one.
 *
 * frontend-admin's tests run on bare `node --test`, which has no document and
 * cannot parse JSX. This installs jsdom's window as the globals React expects,
 * so a component can be mounted for real — a keydown that actually dispatches,
 * a body whose style actually changes — rather than against a hand-rolled fake
 * that would only ever confirm the fake.
 *
 * Call installDom() once per test file, before importing anything that touches
 * the DOM. Components are built with React.createElement rather than JSX,
 * which needs no transform.
 */
import { JSDOM } from 'jsdom';

export const installDom = () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  // node defines its own navigator as a getter-only property, so it has to be
  // replaced rather than assigned.
  Object.defineProperty(globalThis, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  });
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.Event = dom.window.Event;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  globalThis.MouseEvent = dom.window.MouseEvent;
  // React 19 refuses to render outside an act() environment unless told this
  // is a test; without it every update warns and some are deferred.
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  return dom;
};

/* Escape, as the browser delivers it. */
export const pressEscape = () => pressKey('Escape');

export const pressKey = (key) => {
  globalThis.window.dispatchEvent(
    new globalThis.window.KeyboardEvent('keydown', { key, bubbles: true })
  );
};
