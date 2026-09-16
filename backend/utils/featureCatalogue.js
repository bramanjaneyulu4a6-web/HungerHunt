/* What the staff apps can hide, and from whom.
 *
 * Every feature that can be switched off has a key here. Menu entries are
 * keyed by their route so a nav can ask "is this path hidden" with no
 * translation; in-page buttons carry their own names. This is a frontend
 * hide, not a permission — a hidden route still answers to a typed URL, and
 * every request behind it is judged by its own gate.
 *
 * The super admin sees everything, always: settings apply to plain admins, and
 * the effective set for a super admin is empty whatever is stored. */

/* `roles` says which account role the feature belongs to, and so which app
   reads it: the admin console for 'admin', the warehouse app for 'warehouse'
   and 'caretaker'. Menu entries are keyed by route; the warehouse app's tabs
   carry a wh: prefix so they cannot be confused with the console's routes. */
export const FEATURES = [
  // Admin console
  { key: '/billing', label: 'Point of Sale', group: 'Operations', roles: ['admin'] },
  { key: '/reports', label: 'Reports', group: 'Operations', roles: ['admin'] },
  { key: '/recharge-history', label: 'Wallet Ledger', group: 'Operations', roles: ['admin'] },
  { key: '/transactions', label: 'Transactions', group: 'Operations', roles: ['admin'] },
  { key: '/accounting-export', label: 'TallyPrime Export', group: 'Operations', roles: ['admin'] },
  { key: '/users/students', label: 'Students', group: 'Users', roles: ['admin'] },
  { key: '/users/parents', label: 'Parents', group: 'Users', roles: ['admin'] },
  { key: '/users/archived', label: 'Archived users', group: 'Users', roles: ['admin'] },
  { key: 'students.purchaseCode', label: 'Purchase code button (Students)', group: 'Users', roles: ['admin'] },
  { key: 'parents.resetAccess', label: 'Reset access button (Parents)', group: 'Users', roles: ['admin'] },
  { key: '/warehouse', label: 'Warehouse overview', group: 'Warehouse', roles: ['admin'] },
  { key: '/warehouse/student-orders', label: 'Student orders', group: 'Warehouse', roles: ['admin'] },
  { key: '/warehouse/review', label: 'Review requests', group: 'Warehouse', roles: ['admin'] },
  { key: '/warehouse/orders', label: 'Order ledger', group: 'Warehouse', roles: ['admin'] },
  { key: '/warehouse/inventory', label: 'Inventory', group: 'Warehouse', roles: ['admin'] },
  { key: '/warehouse/products', label: 'Product catalogue', group: 'Warehouse', roles: ['admin'] },
  { key: '/warehouse/suppliers', label: 'Suppliers', group: 'Warehouse', roles: ['admin'] },

  // Warehouse app, storeroom accounts. The Active tab is the landing screen
  // and stays, like the console's Dashboard.
  { key: 'wh:/inventory', label: 'Inventory tab', group: 'Tabs', roles: ['warehouse'] },
  { key: 'wh:/purchases', label: 'Purchases tab', group: 'Tabs', roles: ['warehouse'] },
  { key: 'wh:/records', label: 'Records tab', group: 'Tabs', roles: ['warehouse'] },
  { key: 'warehouse.orderStock', label: 'Order stock and suggest what is low (Inventory)', group: 'Actions', roles: ['warehouse'] },
  { key: 'warehouse.receive', label: 'Receive supplier deliveries (Purchases)', group: 'Actions', roles: ['warehouse'] },
  { key: 'warehouse.printOrders', label: 'Print orders list (Active)', group: 'Actions', roles: ['warehouse'] },
  { key: 'warehouse.reportIssue', label: 'Report an issue on an order (Active)', group: 'Actions', roles: ['warehouse'] },

  // Warehouse app, caretaker accounts. Collecting a package is the job
  // itself and is not hideable.
  { key: 'caretaker.reports', label: 'Reports page', group: 'Screens', roles: ['caretaker'] },
  { key: 'caretaker.history', label: 'History view (Room packages)', group: 'Screens', roles: ['caretaker'] },
  { key: 'caretaker.reportPackage', label: 'Issue with this package', group: 'Actions', roles: ['caretaker'] },
];

export const FEATURE_KEYS = new Set(FEATURES.map((feature) => feature.key));

export const featuresForRole = (role) => FEATURES.filter((feature) => feature.roles.includes(role));

// The apps before this existed: the owner's decision of 2026-09-12 left a
// plain admin with Dashboard, Students, Parents, Wallet Ledger and
// Transactions; the warehouse app hid nothing. That is what a role sees until
// a super admin changes it.
export const DEFAULT_HIDDEN = {
  warehouse: [],
  caretaker: [],
  admin: [
    '/billing',
    '/reports',
    '/accounting-export',
    '/users/archived',
    '/warehouse',
    '/warehouse/student-orders',
    '/warehouse/review',
    '/warehouse/orders',
    '/warehouse/inventory',
    '/warehouse/products',
    '/warehouse/suppliers',
  ],
};

// The roles that can carry a setting: one per app audience.
export const SETTABLE_ROLES = ['admin', 'warehouse', 'caretaker'];

export const OVERRIDE_VALUES = ['hidden', 'shown'];

const knownKeys = (keys) => [...new Set((Array.isArray(keys) ? keys : []).map(String))]
  .filter((key) => FEATURE_KEYS.has(key));

/* The set a given account does not see.
 *
 * Per-account overrides win over the role's list, which wins over the
 * built-in default. `roleHidden` is null when nothing has been stored for the
 * role yet, which is different from an empty list a super admin saved on
 * purpose. */
export const effectiveHidden = ({ role = 'admin', isSuperAdmin = false, roleHidden = null, overrides = {} } = {}) => {
  if (isSuperAdmin) return [];
  const base = new Set(knownKeys(roleHidden ?? DEFAULT_HIDDEN[role] ?? []));
  for (const [key, value] of Object.entries(overrides || {})) {
    if (!FEATURE_KEYS.has(key)) continue;
    if (value === 'hidden') base.add(key);
    if (value === 'shown') base.delete(key);
  }
  return featuresForRole(role).map((feature) => feature.key).filter((key) => base.has(key));
};

// Body validation for the two write endpoints. Returns a problem string or null.
export const hiddenListProblem = (value) => {
  if (!Array.isArray(value)) return 'hidden must be a list of feature keys.';
  const unknown = value.map(String).filter((key) => !FEATURE_KEYS.has(key));
  return unknown.length ? `Unknown feature: ${unknown.join(', ')}.` : null;
};

export const overridesProblem = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'overrides must be an object of feature key to "hidden", "shown" or null.';
  }
  for (const [key, setting] of Object.entries(value)) {
    if (!FEATURE_KEYS.has(key)) return `Unknown feature: ${key}.`;
    if (setting !== null && !OVERRIDE_VALUES.includes(setting)) {
      return `${key} must be "hidden", "shown" or null.`;
    }
  }
  return null;
};
