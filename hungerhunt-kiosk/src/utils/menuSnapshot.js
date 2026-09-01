/* The last menu this till successfully showed, persisted so the next launch
   paints it immediately while the real fetch runs behind it. Menu rows only —
   names, prices, images, availability. Nothing about any student, wallet or
   code ever goes in here, and nothing here is trusted for a sale: the
   availability guard and the server re-check everything at purchase time.

   Nor does it soften a failure. A refresh that errors still takes the till to
   the technical-difficulties screen; a snapshot shortens the wait before a
   working backend answers, it never stands in for one.

   Storage is a bonus, never a requirement: a full disk, a blocked WebView or
   corrupted JSON all degrade to "no snapshot", which is exactly the cold
   start the kiosk already survives today. */
const KEY = 'kiosk-menu-snapshot-v1';

export const loadMenuSnapshot = () => {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
};

export const saveMenuSnapshot = (rows) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* deliberately swallowed — see header comment */
  }
};
