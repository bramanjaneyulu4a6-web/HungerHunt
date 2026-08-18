import { mock } from 'node:test';

// Shared by every role test: models the one account row a staff gate looks
// up, answering the way Mongo would. A gate's filter carries
// {$or: [{role: {$in: [...]}}, {role: {$exists: false}}]}; the returned
// matcher's `role` argument is the row's stored value — pass undefined for a
// row that predates roles entirely.
//
// Takes the Admin model and the id every test signs its tokens for, rather
// than importing Admin itself, because the test files set process.env.* and
// dynamically import their models before anything else — importing Admin at
// this module's top level would race that ordering, and mock.method has to
// patch the same model instance the app under test resolves to.
export const accountMatcher = (Admin, staffId) => (role) => {
  mock.method(Admin, 'exists', async (filter) => {
    if (String(filter._id) !== staffId) return null;

    const branches = filter.$or ?? [];
    const allowed = branches.find((b) => b.role?.$in)?.role.$in ?? [];
    const acceptsMissing = branches.some((b) => b.role?.$exists === false);

    const matches = role === undefined ? acceptsMissing : allowed.includes(role);
    return matches ? { _id: staffId } : null;
  });

  mock.method(Admin, 'countDocuments', async () => 1);
};
