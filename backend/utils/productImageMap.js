/* Pairing a folder of pictures with the catalogue.
 *
 * The filenames were typed by whoever collected the art, so they are the
 * product names as a person says them rather than as the catalogue stores
 * them. Most need nothing; five need saying explicitly. That map is here, in
 * one visible list, because the alternative — fuzzy matching on similarity —
 * fails in the direction nobody checks: it pairs confidently and wrongly, and
 * the error is only ever found by a child looking at the wrong picture.
 *
 * Nothing here reads a file or talks to Cloudinary. It decides pairings, and
 * the script that uploads asks it what to do. */

const IMAGE_EXTENSIONS = ['.avif', '.webp', '.png', '.jpg', '.jpeg'];

/* Filename (without extension) → the name the catalogue uses. Only the five
   that differ; anything absent is already spelled correctly. */
const ALIASES = new Map([
  ["blue lay's", "Lay's Magic Masala - Blue Lays"],
  ["green lay's", "Lay's American Style Cream & Onion - Green Lays"],
  ['amul lassi', 'Lassi'],
  ['appy fizz', 'Appy Fizz'],
  ['7 up', '7 UP'],
]);

const key = (value) => String(value ?? '').trim().toLowerCase();

const extensionOf = (file) => {
  const dot = String(file).lastIndexOf('.');
  return dot === -1 ? '' : String(file).slice(dot).toLowerCase();
};

export const isImageFile = (file) => IMAGE_EXTENSIONS.includes(extensionOf(file));

const stem = (file) => {
  const dot = String(file).lastIndexOf('.');
  return dot === -1 ? String(file) : String(file).slice(0, dot);
};

/* The catalogue name this file is art for. An unaliased file simply is its
   product's name, which is why the map above stays as short as it does. */
export const productNameForImage = (file) => ALIASES.get(key(stem(file))) ?? stem(file);

/* What the upload would do, decided before anything is uploaded: which file
   goes to which product, what art each would replace, and which files name
   nothing the catalogue holds. */
export const planImageAssignments = (files, products) => {
  const byName = new Map((products || []).map((product) => [key(product.name), product]));
  const matched = [];
  const unmatched = [];
  const claimed = new Map();

  for (const file of (files || []).filter(isImageFile)) {
    const wanted = productNameForImage(file);
    const product = byName.get(key(wanted));

    if (!product) {
      unmatched.push(file);
      continue;
    }

    // Two files for one product means the last upload silently wins, which is
    // a coin toss standing in for a decision nobody made.
    const already = claimed.get(key(wanted));

    if (already) {
      throw new Error(
        `Two files both claim "${product.name}": ${already} and ${file}. Remove one.`
      );
    }

    claimed.set(key(wanted), file);
    matched.push({ file, product, replacing: product.image || '' });
  }

  return { matched, unmatched };
};

/* The public id Cloudinary stores the picture under. Derived from the product
   name rather than left to Cloudinary's random id so that re-running the
   upload replaces the asset it wrote last time — otherwise every run adds a
   copy beside the old one and the account grows a duplicate per run while the
   product still points at only one of them. */
export const cloudinaryIdFor = (productName) => {
  const id = String(productName ?? '')
    .toLowerCase()
    // Apostrophes vanish rather than becoming separators: Lay's is one word
    // said aloud, and "lay-s" reads as two.
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!id) {
    throw new Error(`Cannot build a Cloudinary id from "${productName}".`);
  }

  return id;
};
