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
