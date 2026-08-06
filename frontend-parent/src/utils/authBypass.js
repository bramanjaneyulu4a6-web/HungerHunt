// Dev-only login bypass for the Ashok-work branch. `import.meta.env.DEV` is
// statically replaced by Vite, so this whole branch is dropped from a
// production build even if VITE_AUTH_BYPASS somehow leaks into the env.
export const authBypassEnabled =
  import.meta.env.DEV && import.meta.env.VITE_AUTH_BYPASS === 'true';

// Placeholder identity that satisfies the route guard and the navbar greeting.
// Every real figure on screen still comes from the API, which the backend
// bypass resolves to the first parent in the database.
export const bypassParent = {
  id: 'auth-bypass',
  fatherName: 'Dev Bypass',
  phone: '0000000000',
  email: 'dev-bypass@localhost',
  studentIds: []
};
