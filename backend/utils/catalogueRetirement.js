/* Which rows the new catalogue leaves behind.
 *
 * The catalogue has no delete: orders, receipts and transactions reference
 * product rows forever, so a product taken off sale is archived, not removed.
 * "Replace the catalogue" therefore means two different operations — the seed
 * writes what the new list contains, and this decides what the new list has
 * stopped containing.
 *
 * Kept out of the script that writes because it is a set difference over
 * names, and a set difference is exactly where a stray capital or a trailing
 * space quietly archives something still being sold. */

const key = (name) => String(name ?? '').trim().toLowerCase();

/* An empty keep list means every product is retired, which is a catastrophe
   dressed as an ordinary result — it happens when a catalogue file fails to
   parse or a name field is misspelled upstream. There is no legitimate call
   for it, so it throws rather than returning the whole catalogue. */
const keepSet = (keepNames, what) => {
  const set = new Set((keepNames || []).map(key).filter(Boolean));

  if (!set.size) {
    throw new Error(`Refusing to retire every ${what}: the keep list is empty.`);
  }

  return set;
};

/* Already-archived rows are left out so the count means what it says and a
   second run has nothing to do. `active !== false` rather than `active`,
   because rows written before the field carry no flag and are on sale. */
export const retiredProducts = (products, keepNames) => {
  const keep = keepSet(keepNames, 'product');
  return (products || []).filter(
    (product) => product.active !== false && !keep.has(key(product.name))
  );
};

export const retiredGroups = (groups, keepNames) => {
  const keep = keepSet(keepNames, 'stock group');
  return (groups || []).filter((group) => !keep.has(key(group.name)));
};
