/* Turning the class/section pairs the server reports into the two dropdowns
 * that filter the students list.
 *
 * The pairs are reported rather than declared because the roll disagrees with
 * itself — Roman and Arabic numerals for the same years, three spellings of
 * one section, students with no class at all. Nothing here tries to tidy that
 * up: a filter that silently folded "MG" into "MG 1" would hide students from
 * a search that appeared to include them, which is worse than an untidy
 * dropdown. The mess is shown so somebody can go and fix the data.
 */

/* Distinct classes, left in the order the server sorted them.
 *
 * Deliberately not re-sorted here. The roll mixes "VIII" with "8", and no
 * comparison this file could make would read as correct for both — it would
 * only be a different kind of wrong, decided further from the data. */
export const classesFrom = (pairs = []) => [
  ...new Set(pairs.map((pair) => pair?.className).filter(Boolean)),
];

/* The sections belonging to one class, and nothing else.
 *
 * An empty list is the honest answer when no class is chosen: offering all
 * fifteen sections at once would mostly offer combinations that match nobody,
 * and a student picking one would get an empty table with no hint why. The
 * control is disabled on an empty list rather than shown as an empty menu.
 *
 * Blank sections are dropped, because "all of this class" is what the empty
 * option already means; a second, unnamed way to say it would be indistinct. */
export const sectionsFor = (pairs = [], className) => {
  if (!className) return [];

  return [
    ...new Set(
      pairs
        .filter((pair) => pair?.className === className && pair?.section)
        .map((pair) => pair.section)
    ),
  ];
};
