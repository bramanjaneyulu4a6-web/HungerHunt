/* The steps the add/edit product form walks through, and what each one still
   needs before it can be left.
 *
 * The form used to be eleven boxes in one scroll, in an order that put the
 * safety-stock buffer second — above the category, the unit and even the
 * price. These steps put the decisions in the order they are actually made:
 * what the thing is, what it costs, how much to keep, then the optional rules
 * nobody fills in on the first pass.
 *
 * The unit list is filtered by the category chosen in step one, which is the
 * other reason for the split: "what is this measured in?" has a sensible short
 * answer only once the category is known.
 *
 * Kept out of the component because only the current step is mounted, so the
 * browser's own `required` handling says nothing about a submit pressed on
 * step four — these rules are the real gate, and a gate deserves tests. */

export const WIZARD_STEPS = [
  { title: 'Basics', hint: 'What it is, and where it sits on the kiosk.' },
  { title: 'Price & Unit', hint: 'What it sells for, and what it is measured in.' },
  { title: 'Stock', hint: 'When the office should reorder it.' },
  { title: 'Extras', hint: 'Optional. Skip and come back any time.' },
];

/* Returns what still stops this step being finished, or '' when nothing does.
   Messages are the sentence shown to the office, so they name the fix. */
export const stepProblem = (index, form) => {
  if (index === 0) {
    if (!form.name.trim()) return 'Give the product a name.';
    if (!form.stockGroup) return 'Choose a category.';
    if (!form.subCategory) return 'Choose a sub-category.';
  }

  if (index === 1) {
    if (!form.unit) return 'Choose the unit this is measured in.';
    // Above zero, not merely present: the till reads a price of 0 as free and
    // hands the goods over, and the server refuses one outright.
    if (!(Number(form.price) > 0)) return 'Enter a selling price above ₹0.';
  }

  if (index === 2) {
    // Blank is not zero. Both fields have a meaningful 0 — never flag, no
    // buffer — so an empty box is an unanswered question, not a zero.
    if (form.reorderLevel === '' || !(Number(form.reorderLevel) >= 0)) {
      return 'Enter a reorder level of 0 or more.';
    }
    if (form.safetyStock === '' || !(Number(form.safetyStock) >= 0)) {
      return 'Enter a safety stock of 0 or more.';
    }
  }

  if (index === 3 && form.purchaseLimitEnabled && !(Number(form.purchaseLimitQuantity) >= 1)) {
    // A product nobody may buy is an archived product; the server says so too.
    return 'A per-student limit must be at least 1, or switch the limit off.';
  }

  return '';
};

/* The first step still holding the save up, or -1 when none is. */
export const firstUnfinishedStep = (form) =>
  WIZARD_STEPS.findIndex((_, index) => stepProblem(index, form));

/* A step is reachable once everything before it is settled — which in edit
   mode is immediately, since an existing product already satisfies every step.
   That is what lets an edit jump straight to the field it was opened for. */
export const canReachStep = (index, form) =>
  index === 0 || WIZARD_STEPS.slice(0, index).every((_, i) => !stepProblem(i, form));
