// Dev-only login bypass for the Ashok-work branch. `import.meta.env.DEV` is
// statically replaced by Vite, so this whole branch is dropped from a
// production build even if VITE_AUTH_BYPASS somehow leaks into the env.
export const authBypassEnabled =
  import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === 'true';
