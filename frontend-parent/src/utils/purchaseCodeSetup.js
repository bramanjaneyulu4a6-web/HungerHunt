import { purchaseCodeProblem } from './validation.js';

/* The onboarding screen's form: one code and one retype for each child who
   still needs one, saved together.
 *
 * Both of these are pure and live apart from the screen, because the rule that
 * matters — a parent cannot leave a child without a code — is worth testing
 * without a browser, and because the screen is then only a form.
 *
 * `entries` is keyed by student id: { [id]: { code, confirm } }. */

// The first problem on the form, named after the child it belongs to, or null
// when every child has a matching four-digit code. First rather than all, and
// in the order the children appear on screen: a parent fixes a form from the
// top, so naming a later mistake would send them past an earlier one.
export const purchaseCodeSetupProblem = (children, entries) => {
  for (const child of children ?? []) {
    const { code = '', confirm = '' } = entries?.[child._id] ?? {};

    const problem = purchaseCodeProblem(code);
    if (problem) return `${child.name}: ${problem}`;

    if (code !== confirm) {
      return `${child.name}: the two codes do not match.`;
    }
  }

  return null;
};

// What the screen's single Save actually sends. The endpoint sets one child's
// code, so a family of three is three requests; this names them in screen
// order so a failure part-way through can be reported against a child.
export const purchaseCodeSetupSaves = (children, entries) =>
  (children ?? []).map((child) => ({
    studentId: child._id,
    name: child.name,
    password: entries?.[child._id]?.code ?? '',
  }));
