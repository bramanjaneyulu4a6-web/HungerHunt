/* Which menu items the signed-in account sees.
 *
 * The hidden set comes from the server (GET /admin/me → hiddenFeatures): the
 * role's default as set by a super admin, plus this account's exceptions. It
 * is a frontend hide, not a permission; the routes still answer to a typed
 * URL. The super admin is the exception: every option is unhidden for that
 * account whatever the set says. Pure, so the rule can be tested without
 * rendering the sidebar. */
export const visibleNav = (items, hiddenPaths, { isSuperAdmin = false } = {}) =>
  isSuperAdmin ? items : items.filter((item) => !hiddenPaths.has(item.path));
