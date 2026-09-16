/* The one rule for turning the retired combined grade value ("9-B") into the
 * className/section pair. The migration script and every legacy fallback use
 * this, so a value can never split two different ways in two places.
 *
 * Split on the LAST hyphen: sections are single suffixes, but a class name
 * can carry hyphens of its own ("LKG-A" is class LKG, section A; a plain "10"
 * is all class). */
export const splitGrade = (value) => {
  const whole = String(value ?? '').trim();
  if (!whole) return { className: '', section: '' };

  const cut = whole.lastIndexOf('-');
  if (cut <= 0 || cut === whole.length - 1) {
    return { className: whole, section: '' };
  }

  return {
    className: whole.slice(0, cut).trim(),
    section: whole.slice(cut + 1).trim(),
  };
};

/* Class names are numbers. The roll arrives in Roman numerals because the
 * spreadsheet it is extracted from is written that way, and the two spellings
 * are separate values to a database that matches exactly — so a roll holding
 * both offers "VIII" and "8" as different classes in every filter, and a
 * student is reachable only through whichever one their row happens to carry.
 *
 * An explicit table rather than a Roman-numeral parser. A parser has to decide
 * what to do with "MB", "MG" and "MINDS", all of which are real values in this
 * data and all of which are made of letters a parser would read as numerals.
 * A table converts the twelve things a class can be and is blind to everything
 * else, which is the behaviour that matters: LKG, UKG, Demo and anything the
 * school invents next pass through untouched.
 */
const ROMAN_CLASSES = new Map([
  ['I', '1'], ['II', '2'], ['III', '3'], ['IV', '4'], ['V', '5'], ['VI', '6'],
  ['VII', '7'], ['VIII', '8'], ['IX', '9'], ['X', '10'], ['XI', '11'], ['XII', '12'],
]);

export const normalizeClassName = (value) => {
  const whole = String(value ?? '').trim();

  return ROMAN_CLASSES.get(whole.toUpperCase()) ?? whole;
};
