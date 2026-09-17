import { mock } from 'node:test';

/* For suites whose routes sit behind requireFeature (middleware/featureGate.js)
   but are not about feature visibility: the signed-in account reads as a plain
   admin with no stored settings, so every gated route is open — the built-in
   default hides none of them. Takes the models for the same reason
   accountIs.js does: the test file imports them after setting its env. A test
   that stubs Admin.findById itself replaces this stub for that test. */
export const featuresOpen = (Admin, FeatureVisibility) => {
  const query = (value) => ({ select() { return this; }, lean: async () => value });
  mock.method(Admin, 'findById', (id) => query({ _id: id, role: 'admin' }));
  mock.method(FeatureVisibility, 'findOne', () => query(null));
};
