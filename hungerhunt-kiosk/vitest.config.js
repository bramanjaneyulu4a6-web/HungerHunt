import { defineConfig } from 'vite';

// The kiosk's only unit tests are the session timers, which need a DOM to
// listen for touches on and a clock that can be fast-forwarded.
export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
