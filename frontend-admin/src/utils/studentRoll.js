/* The whole student roll, read in pages.
 *
 * GET /students without a page returns at most 500 rows, and the roll passed
 * that in September 2026 when grades 6–10 were seeded on top of MINDS X. A
 * screen that reads the list unpaged then quietly shows the first 500 by name
 * and nobody after them — the wallet ledger did exactly that. This walks the
 * pages the server does serve, at the largest size it allows, so a screen
 * that needs everyone gets everyone.
 *
 * `get` is api.get, passed in rather than imported so this can be tested
 * without axios or a browser. Extra params (a status, a room) pass through
 * to every page. */
export const ROLL_PAGE_SIZE = 500;

export async function fetchAllStudents(get, params = {}) {
  const students = [];
  let page = 1;

  for (;;) {
    const { data } = await get('/students', {
      params: { ...params, page, limit: ROLL_PAGE_SIZE },
    });
    const batch = data?.students || [];
    students.push(...batch);

    const pages = data?.pages || 1;
    if (page >= pages || batch.length === 0) break;
    page += 1;
  }

  return students;
}
