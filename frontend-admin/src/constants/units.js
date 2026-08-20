/* Which measurement units each category may be sold in.
 *
 * Categories are defined in code (backend/scripts/data/catalogue.json, loaded
 * by seedCatalogue.js) and cannot be added, renamed or removed from the admin
 * console — that lockdown is what lets this map key off the category name and
 * stay correct. Adding a category means editing both files and re-seeding.
 *
 * The point is to stop a bag of crisps being priced per millilitre. A shorter
 * dropdown is the side effect, not the goal, which is why an unrecognised
 * category falls back to every unit rather than to none: a name this map has
 * not caught up with should slow the office down, not lock it out. */

export const UNIT_SYMBOLS = ['g', 'ml', 'L', 'pc'];

const BY_CATEGORY = {
  'Snacks': ['g', 'pc'],
  'Beverages': ['ml', 'L'],
  'Ice Cream': ['ml', 'pc'],
  'Personal Care': ['ml', 'g', 'pc'],
  'Stationery': ['pc'],
  'Hostel Essentials': ['pc', 'g'],
};

const LOOKUP = new Map(
  Object.entries(BY_CATEGORY).map(([name, symbols]) => [name.toLowerCase(), symbols])
);

export const unitSymbolsForCategory = (categoryName) => {
  const key = String(categoryName ?? '').trim().toLowerCase();
  return LOOKUP.get(key) || UNIT_SYMBOLS;
};

/* Resolves the map to the Unit rows the server actually holds. A symbol with
   no row is dropped rather than shown as a dead option — the seed adds the
   four above, but a backend deployed before that seed ran holds only `pc`. */
export const unitsForCategory = (units, categoryName) => {
  const bySymbol = new Map((units || []).map((unit) => [unit.symbol, unit]));
  return unitSymbolsForCategory(categoryName)
    .map((symbol) => bySymbol.get(symbol))
    .filter(Boolean);
};
