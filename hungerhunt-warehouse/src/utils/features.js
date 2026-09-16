/* Which of the app's tabs an account sees.
 *
 * A tab is keyed on the server as "wh:" plus its path, so the same hidden set
 * that names in-page actions ("warehouse.printOrders") can name a tab without
 * the two vocabularies colliding. The Active tab at "/" is the landing screen
 * and is never in the set, but the rule does not need to know that. Pure, so
 * it is tested without rendering the tab bar. */
export const tabKey = (path) => `wh:${path}`;

export const visibleTabs = (tabs, hiddenFeatures = []) => {
  const hidden = new Set(hiddenFeatures);
  return tabs.filter((tab) => !hidden.has(tabKey(tab.to)));
};
