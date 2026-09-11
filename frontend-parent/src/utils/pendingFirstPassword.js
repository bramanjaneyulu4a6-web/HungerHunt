/* The phone number the sign-in screen has just established needs first-time
   setup, handed to the create-password screen.
 *
 * Deliberately a module variable and not sessionStorage. Nothing about a
 * first-time sign-in exists anywhere until /parent/first-password succeeds —
 * the SMS code lives in Firebase's verifier and the password only in the form —
 * so a parent who reloads the page has nothing to resume: the verification
 * token is gone with the page that held it, and the account still has no
 * password. Storage that survived the reload would drop them back into the
 * middle of a flow whose state it cannot restore, and the screen would ask for
 * a code it can no longer check.
 *
 * A reload loads this module afresh, empty, so the create-password screen's
 * existing guard sends them to the phone-number screen to start over. That is
 * the intended behavior, not a side effect. */
let phone = '';

export const setPendingFirstPasswordPhone = (value) => {
  phone = String(value ?? '');
};

export const pendingFirstPasswordPhone = () => phone;

export const clearPendingFirstPasswordPhone = () => {
  phone = '';
};
