/* The kiosk's gate, and the switch that takes it away.
 *
 * Normally this terminal asks for an admission number before it shows anybody
 * a catalogue. With VITE_KIOSK_LOGIN_DISABLED=true it stops asking, and drives
 * the demo student instead: the kiosk opens straight onto the selection screen
 * and every visitor gets the same showroom session.
 *
 * What makes that safe is not this file. It is Student.demoAccount on the row
 * the server answers with — settleDemoBill short-circuits before generateBill
 * opens its transaction, so no wallet is debited, no stock moves, and no
 * transaction, package or notification is written. See backend/utils/demoAccount.js.
 * This flag only decides who is offered the door; the demo account decides that
 * walking through it costs nothing. src/pages/DemoKiosk.jsx therefore refuses a
 * session that comes back without demo set, rather than trusting this switch to
 * have been pointed at the right admission number.
 *
 * Read at build time, like VITE_API_BASE_URL beside it. `npm run build` bakes
 * the value into the bundle, so turning the gate back on is a Vercel redeploy
 * AND a fresh APK — the sideloaded tablets carry whatever this said when they
 * were wrapped.
 */

// Exactly the string "true", case- and space-insensitive. Anything else — a
// typo, a stray comment, an unset variable — leaves the gate standing, which is
// the direction a mistake should fail in.
export const LOGIN_DISABLED =
  String(import.meta.env.VITE_KIOSK_LOGIN_DISABLED ?? "").trim().toLowerCase() === "true";

// The showroom account from backend/scripts/createDemoStudent.js, whose default
// is the same DEMO01. Overridable only so a second demo row can be seeded
// without a code change; it is still checked for demoAccount on arrival.
export const DEMO_ADMISSION =
  String(import.meta.env.VITE_KIOSK_DEMO_ADMISSION || "DEMO01").trim().toUpperCase();
