# Parent App Store Release Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the parent app to the point where the only remaining release work is console clicks, signing and device capture — by shipping self-service account deletion, the store listing and privacy answers, the asset pipeline, and an interim Android APK path.

**Architecture:** Deletion is not a new concept: the `Parent` model already carries `active` / `archivedAt` / `archivedBy`, and `archiveParent` already performs the exact transition. This work extracts the one helper that transition needs, adds a parent-authenticated route that reuses it, and gives the app its first settings screen to host it. Everything else is documentation and asset tooling, which lands alongside the existing `RELEASE-CHECKLIST.md` rather than replacing it.

**Tech Stack:** Node 20 + Express + Mongoose (backend, ESM, `node:test` with `mock.method` stubs and no database); React 19 + Vite + react-router 7 (frontend-parent); Capacitor 8 for the native shells; macOS `sips` and headless Google Chrome for image work.

**Spec:** [docs/superpowers/specs/2026-09-02-parent-app-store-release-design.md](../specs/2026-09-02-parent-app-store-release-design.md)

## Global Constraints

- **The parent never reads the word "archive".** Server-side and admin-side the transition is archival; every string a parent can see says "delete"/"deleted". No "deactivate", no "disable".
- **No database in backend tests.** `backend/tests/*.test.js` stub every model call with `mock.method`. Never add a test that needs a live Mongo. Never point any script or test at production Atlas.
- **Lint is zero-tolerance.** `npm run lint --prefix frontend-parent` must end at 0 errors, 0 warnings; CI runs it with `--max-warnings 0`.
- **A wrong password is a 401 *without* `code: 'AUTH_REQUIRED'`.** That code is reserved for `middleware/authMiddleware.js`'s `denied()`. The frontend interceptor in `src/services/api.js` signs the parent out on `AUTH_REQUIRED` only, and a form-level 401 that carried it would sign someone out for a typo. Precedent: `resetPurchasePassword` (`controllers/parentController.js:610`).
- **Audience answers are fixed:** one school, public listing, target audience 18+, not directed at children, no ads.
- **Bundle id / application id on both platforms:** `com.hungerhunt.parent`.
- **Payments are PhonePe, real money, not IAP.** Every privacy form declares financial information; Apple review notes carry the "consumed outside the app" exemption argument.
- **No new npm dependency** is added by this plan, to any package.
- **Commit style:** subject line in the imperative describing the effect, not the mechanism, matching the existing log ("Stop the orders tab linking to itself"). End every commit message with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

**Backend**
- Create `backend/utils/studentRegistration.js` — the one helper that keeps `Student.isParentRegistered` truthful. Currently module-private inside `adminUserController.js`; two controllers need it now.
- Create `backend/tests/parentAccountDeletion.test.js` — the new route's tests.
- Modify `backend/models/Parent.js` — add `archivedReason`.
- Modify `backend/controllers/adminUserController.js` — import the extracted helper, delete the local copy, stamp `archivedReason: 'admin'`, expose it in `parentView`.
- Modify `backend/controllers/parentController.js` — add `deleteParentAccount`.
- Modify `backend/routes/parentRoutes.js` — wire `DELETE /account`.

**Frontend**
- Create `frontend-parent/src/pages/Account.jsx` — the app's first settings screen: the parent's own details, the policy links, and the delete section.
- Modify `frontend-parent/src/context/AuthContext.jsx` — `logout` gains an option for the case where the session is already dead server-side.
- Modify `frontend-parent/src/components/Navbar.jsx` — an Account entry in both navs.
- Modify `frontend-parent/src/App.jsx` — the `/account` protected route.
- Modify `frontend-parent/src/pages/Login.jsx` — the post-deletion banner.
- Modify `frontend-parent/src/pages/PrivacyPolicy.jsx` — section 6 rewritten around the real deletion route.
- Modify `frontend-parent/src/parent.css` — styles for the settings screen's danger section.
- Modify `frontend-parent/package.json` — `apk:release`.

**Docs and tooling**
- Create `docs/store-listing.md` — every field both consoles ask for.
- Create `docs/store-assets.md` — the capture shot list and the sizes.
- Create `scripts/store-screenshots.mjs` — resize/pad captures to exact store dimensions.
- Create `scripts/store-graphic/feature-graphic.html` — the 1024×500 source.
- Create `scripts/render-store-graphic.mjs` — renders it with headless Chrome.
- Modify `docs/android-apk-builds.md` — the parent app's interim APK, and its expiry.
- Modify `RELEASE-CHECKLIST.md` — deletion shipped, closed testing recorded, listing block replaced by a pointer.

---

## Task 1: Extract the student-registration helper and record who archived an account

Nothing user-visible. This makes the transition reusable and makes a self-closed account distinguishable from an office-closed one, so Task 2 has something honest to write.

**Files:**
- Create: `backend/utils/studentRegistration.js`
- Modify: `backend/models/Parent.js:33-34`
- Modify: `backend/controllers/adminUserController.js:14-30` (`parentView`), `:81-86` (the local helper), `:182-200` (`archiveParent`)
- Test: `backend/tests/adminUsers.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `syncStudentRegistration(ids: (string | ObjectId)[]) => Promise<void>` from `backend/utils/studentRegistration.js`
  - `Parent.archivedReason: 'admin' | 'parent' | undefined`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/adminUsers.test.js`, inside the describe block that already covers archiving (match the file's existing stubbing style — read its neighbours before writing):

```js
test('archiving a parent from the console records that staff did it', async () => {
  const saved = [];
  mock.method(PendingOrder, 'exists', async () => null);
  mock.method(Parent, 'findById', async () => ({
    _id: PARENT_ID,
    studentIds: [],
    pushTokens: [{ token: 't', platform: 'android' }],
    tokenVersion: 3,
    save: async function () { saved.push(this); },
  }));
  mock.method(Parent, 'exists', async () => null);
  mock.method(Student, 'updateOne', async () => ({}));

  const res = await fetch(`${base}/api/admin/users/parents/${PARENT_ID}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  assert.equal(res.status, 200);
  assert.equal(saved[0].archivedReason, 'admin');
  assert.equal(saved[0].active, false);
  assert.equal(saved[0].tokenVersion, 4);
  assert.deepEqual(saved[0].pushTokens, []);
});
```

Check the route prefix and the auth-token helper actually used in that file and match them; `/api/admin/users/parents/:id` is the mount implied by `routes/adminUserRoutes.js:20`, but the test file's existing requests are the authority.

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test tests/adminUsers.test.js --prefix backend
```

Run from `backend/`: `node --test tests/adminUsers.test.js`
Expected: FAIL — `archivedReason` is `undefined`.

- [ ] **Step 3: Add the field to the model**

In `backend/models/Parent.js`, directly after the `archivedBy` line:

```js
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },

  // Who closed the account. 'admin' is the office doing it from the console;
  // 'parent' is the parent deleting it from their own phone, where archivedBy
  // is deliberately null because no member of staff was involved. Rows
  // archived before this field existed have neither, and read as 'admin' by
  // circumstance rather than by record — which is true of every one of them.
  archivedReason: { type: String, enum: ["admin", "parent"], default: undefined },
```

- [ ] **Step 4: Create the shared helper**

Create `backend/utils/studentRegistration.js`:

```js
import mongoose from 'mongoose';

import Parent from '../models/Parent.js';
import Student from '../models/Student.js';

const validId = (value) => mongoose.Types.ObjectId.isValid(value);

/* `isParentRegistered` means "some active parent still lists me". It is a
   cached answer, so every transition that changes which parents are active has
   to put it back — the office archiving a parent, the office restoring one,
   and now a parent deleting their own account. Left stale, the roster claims a
   family the till can no longer reach.

   Lived in adminUserController until the parent app grew a route that needed
   it too. */
export const syncStudentRegistration = async (ids) => {
  for (const id of [...new Set(ids.map(String))].filter(validId)) {
    const linked = await Parent.exists({ active: { $ne: false }, studentIds: id });
    await Student.updateOne({ _id: id }, { $set: { isParentRegistered: Boolean(linked) } });
  }
};
```

- [ ] **Step 5: Rewire the admin controller**

In `backend/controllers/adminUserController.js`:

1. Add to the imports: `import { syncStudentRegistration } from '../utils/studentRegistration.js';`
2. Delete the local `const syncStudentRegistration = async (ids) => { … };` block (around line 81).
3. In `parentView`, after the `archivedAt` line, add:
   ```js
   archivedReason: parent.archivedReason || null,
   ```
4. In `archiveParent`, after `parent.archivedBy = req.staff.id;`, add:
   ```js
   parent.archivedReason = 'admin';
   ```
5. In `restoreParent` (the function around line 205 that clears `archivedAt`/`archivedBy`), clear it too, beside the others:
   ```js
   parent.archivedReason = undefined;
   ```

- [ ] **Step 6: Run the full backend suite**

From `backend/`: `npm test`
Expected: PASS, with the new case included and nothing previously green now red. `adminUsers.test.js` exercises the archive and restore paths and is where a broken extraction shows up first.

- [ ] **Step 7: Commit**

```bash
git add backend/utils/studentRegistration.js backend/models/Parent.js \
        backend/controllers/adminUserController.js backend/tests/adminUsers.test.js
git commit -m "$(cat <<'EOF'
Record who closed a parent account

The office archiving a parent and a parent closing their own account are
about to be the same transition with different authors, so the row now
says which it was, and the helper that keeps isParentRegistered honest
moves somewhere both callers can reach.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `DELETE /parent/account`

The store-required route. Reuses Task 1's helper and mirrors `archiveParent`, with a password check, a parent-facing pending-order refusal, and `archivedReason: 'parent'`.

**Files:**
- Create: `backend/tests/parentAccountDeletion.test.js`
- Modify: `backend/controllers/parentController.js` (append a new export)
- Modify: `backend/routes/parentRoutes.js:1-47`

**Interfaces:**
- Consumes: `syncStudentRegistration` from `backend/utils/studentRegistration.js`; `Parent.archivedReason` (Task 1).
- Produces: `DELETE /api/parent/account`, `Authorization: Bearer <parent token>`, body `{ password: string }`.
  - `200 { message: 'Your account has been deleted.' }`
  - `400 { message: 'Your account password is required to delete your account.' }`
  - `401 { message: 'Your account password is incorrect.' }` — no `code` field
  - `409 { message: 'You have a purchase waiting for your answer. Answer it before deleting your account.' }`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/parentAccountDeletion.test.js`. Model the header on `tests/parentSurface.test.js:1-45` — same env vars, same `app.listen(0)` bootstrap, same `mock.method` discipline, no database.

```js
// Deleting a parent account: what it refuses, and what it leaves behind.
//
// No database — every model call is stubbed. What is under test is the rules
// applied before any query runs and the exact shape of the row that gets saved.
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const bcrypt = (await import('bcryptjs')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const { signParentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

const PARENT_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';
const parentToken = signParentToken(PARENT_ID, '9876543210');

let base;
let passwordHash;

before(async () => {
  passwordHash = await bcrypt.hash('correct-horse', 10);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

// protectParent asks whether the session is still live before the controller
// runs, so every test has to answer that first.
const sessionIsLive = () => mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));

const parentRow = (overrides = {}) => ({
  _id: PARENT_ID,
  fatherName: 'Ravi Kumar',
  phone: '9876543210',
  email: 'ravi@example.com',
  password: passwordHash,
  studentIds: [STUDENT_ID],
  pushTokens: [{ token: 'device-a', platform: 'android' }],
  fcmToken: 'legacy',
  tokenVersion: 2,
  ...overrides,
});

const del = (body) =>
  fetch(`${base}/api/parent/account`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${parentToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

afterEach(() => mock.restoreAll());

describe('DELETE /parent/account', () => {
  test('refuses a missing password without touching the row', async () => {
    sessionIsLive();
    let saved = false;
    mock.method(Parent, 'findById', async () => parentRow({ save: async () => { saved = true; } }));

    const res = await del({});

    assert.equal(res.status, 400);
    assert.equal(saved, false);
  });

  test('refuses a wrong password, and does not sign the parent out', async () => {
    sessionIsLive();
    let saved = false;
    mock.method(Parent, 'findById', async () => parentRow({ save: async () => { saved = true; } }));

    const res = await del({ password: 'not-the-password' });
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(saved, false);
    // AUTH_REQUIRED is what the app's interceptor treats as an expired
    // session. A mistyped password must not carry it.
    assert.equal(body.code, undefined);
  });

  test('refuses while an approval is still waiting', async () => {
    sessionIsLive();
    let saved = false;
    mock.method(Parent, 'findById', async () => parentRow({ save: async () => { saved = true; } }));
    mock.method(PendingOrder, 'exists', async () => ({ _id: 'pending' }));

    const res = await del({ password: 'correct-horse' });

    assert.equal(res.status, 409);
    assert.equal(saved, false);
  });

  test('archives the account, clears every device, and unlinks the children', async () => {
    sessionIsLive();
    const registrationWrites = [];
    let saved;
    mock.method(Parent, 'findById', async () =>
      parentRow({ save: async function () { saved = this; } }));
    mock.method(PendingOrder, 'exists', async () => null);
    mock.method(Student, 'updateOne', async (filter, update) => {
      registrationWrites.push({ filter, update });
      return {};
    });

    const res = await del({ password: 'correct-horse' });

    assert.equal(res.status, 200);
    assert.equal(saved.active, false);
    assert.equal(saved.archivedReason, 'parent');
    assert.equal(saved.archivedBy, null);
    assert.ok(saved.archivedAt instanceof Date);
    assert.deepEqual(saved.pushTokens, []);
    assert.equal(saved.fcmToken, null);
    assert.equal(saved.password, undefined);
    // Bumping this is what ends the sessions on the parent's other devices.
    assert.equal(saved.tokenVersion, 3);
    assert.equal(registrationWrites.length, 1);
    assert.equal(
      registrationWrites[0].update.$set.isParentRegistered,
      false,
    );
  });

  test('the token that deleted the account no longer opens anything', async () => {
    // protectParent's own filter excludes active: false, so once the row is
    // archived the same token stops resolving. Simulate the archived row.
    mock.method(Parent, 'exists', async () => null);

    const res = await fetch(`${base}/api/parent/dashboard`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    });

    assert.equal(res.status, 401);
  });
});
```

Note on the fourth test: `Parent.exists` is stubbed for `protectParent`, and Task 1's helper also calls `Parent.exists` — returning a truthy value there means "still linked", so assert on the `Student.updateOne` write rather than on the boolean. If the helper's `exists` call needs a different answer from `protectParent`'s, stub by call order and say so in a comment.

- [ ] **Step 2: Run the tests to verify they fail**

From `backend/`: `node --test tests/parentAccountDeletion.test.js`
Expected: FAIL — every case 404s, because the route does not exist.

- [ ] **Step 3: Write the controller**

Append to `backend/controllers/parentController.js`. Add `import PendingOrder from "../models/PendingOrder.js";` and `import { syncStudentRegistration } from "../utils/studentRegistration.js";` to the imports at the top.

```js
/* =========================================================
   ✅ DELETE PARENT ACCOUNT
   The parent's own route out. Both stores require one for any app that has
   accounts, and the office's archive route is not it: that needs a member of
   staff.

   Server-side this is the same transition archiveParent performs. The row
   survives because approvals, notifications and the students' ledger all
   resolve a parent id — what goes is everything that gets anyone back into
   the account, and every device it was reaching. The privacy policy says so
   in as many words; if that stops being true, that page changes too.
========================================================= */
export const deleteParentAccount = async (req, res) => {
  try {
    const { password } = req.body || {};

    if (!password) {
      return res.status(400).json({
        message: "Your account password is required to delete your account.",
      });
    }

    const parent = await Parent.findById(req.parent.id);

    /* Same 401-without-a-code as resetPurchasePassword: a mistyped password is
       a form error, and the app signs out on AUTH_REQUIRED alone. */
    if (!parent || !parent.password || !(await bcrypt.compare(password, parent.password))) {
      return res.status(401).json({ message: "Your account password is incorrect." });
    }

    /* The same refusal the office gets, in the parent's words. Answering the
       request is a movement of money, and a deletion route is the wrong place
       to decide it either way. */
    if (await PendingOrder.exists({
      parentId: parent._id,
      status: { $in: ['PENDING', 'PROCESSING'] },
    })) {
      return res.status(409).json({
        message: "You have a purchase waiting for your answer. Answer it before deleting your account.",
      });
    }

    parent.active = false;
    parent.archivedAt = new Date();
    parent.archivedBy = null;
    parent.archivedReason = 'parent';
    parent.password = undefined;
    parent.pushTokens = [];
    parent.fcmToken = null;
    parent.resetPasswordToken = undefined;
    parent.resetPasswordExpire = undefined;
    /* Ends every session this account has on every device at once, including
       the one that sent this request. */
    parent.tokenVersion = (parent.tokenVersion ?? 0) + 1;

    await parent.save();
    await syncStudentRegistration((parent.studentIds || []).map(String));

    res.json({ message: "Your account has been deleted." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
```

- [ ] **Step 4: Wire the route**

In `backend/routes/parentRoutes.js`, add `deleteParentAccount` to the import list from `parentController.js`, then add beside the other `protectParent` routes:

```js
/* authLimiter as well as protectParent: this route checks a password, so it is
   guessable in the way the login route is, and a session alone must not make
   guessing cheap. */
router.delete('/account', authLimiter, protectParent, deleteParentAccount);
```

- [ ] **Step 5: Run the tests to verify they pass**

From `backend/`: `node --test tests/parentAccountDeletion.test.js`
Expected: PASS, all five.

- [ ] **Step 6: Run the full backend suite**

From `backend/`: `npm test`
Expected: PASS. Nothing else touches this route, but `parentSessions.test.js` and `parentSurface.test.js` both exercise `protectParent` and would catch a bad route registration.

- [ ] **Step 7: Commit**

```bash
git add backend/controllers/parentController.js backend/routes/parentRoutes.js \
        backend/tests/parentAccountDeletion.test.js
git commit -m "$(cat <<'EOF'
Let a parent close their own account

Both stores require a way out that does not go through the office. It is
the archive transition the console already performs, gated on the account
password, refused while an approval is still waiting, and it ends every
session on every device rather than only the phone it was asked from.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The Account screen

The app's first settings screen. It exists to host deletion, and it also fixes something the store listing would otherwise have to admit: a signed-in parent currently cannot reach any policy page at all.

**Files:**
- Create: `frontend-parent/src/pages/Account.jsx`
- Modify: `frontend-parent/src/context/AuthContext.jsx:37-45`
- Modify: `frontend-parent/src/components/Navbar.jsx:92-125`
- Modify: `frontend-parent/src/App.jsx:118-182`
- Modify: `frontend-parent/src/pages/Login.jsx:17-70`
- Modify: `frontend-parent/src/parent.css` (append)

**Interfaces:**
- Consumes: `DELETE /parent/account` (Task 2).
- Produces: route `/account`; `logout({ sessionAlreadyEnded?: boolean })` from `useAuth()`.

**The ordering trap, read this before writing any code.** `logout()` today calls `stopPush()` *first*, which posts to `/parent/remove-fcm-token` with the token being discarded. After deletion that token is dead, so the request 401s with `code: 'AUTH_REQUIRED'`, and the interceptor in `services/api.js` redirects to `/login?expired=1` — telling a parent who just deleted their account that their session expired. `stopPush` swallowing its own error does not help; the interceptor runs first. The fix is ordering: clear the stored token *before* `stopPush` runs, so the interceptor's `localStorage.getItem('parentToken')` guard is already false. The local push state still has to be reset, or a later sign-in on the same device never re-registers (`startPush` returns early on `started`).

- [ ] **Step 1: Give `logout` the option**

In `frontend-parent/src/context/AuthContext.jsx`, replace the `logout` function:

```js
  /* `sessionAlreadyEnded` is for the one caller whose token is already dead
     server-side: account deletion. Withdrawing the device is normally done
     first, while the session still works, because that request carries the
     token being thrown away. After deletion it cannot work, and letting it run
     with the token still stored makes the 401 interceptor redirect to
     "your session has expired" — the wrong sentence for someone who just
     deleted their account. Clearing first silences it; stopPush still runs,
     because it also resets the module state that lets a later sign-in on this
     device register again. */
  const logout = async ({ sessionAlreadyEnded = false } = {}) => {
    if (sessionAlreadyEnded) {
      localStorage.removeItem('parentToken');
      localStorage.removeItem('parentData');
    }

    await stopPush();

    localStorage.removeItem('parentToken');
    localStorage.removeItem('parentData');
    setParent(null);
  };
```

- [ ] **Step 2: Write the Account page**

Create `frontend-parent/src/pages/Account.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import API from '../services/api';
import { useAuth } from '../context/auth';
import Icon from '../components/Icon';
import { Button, Card, PageHeader, PasswordField } from '../components/ui';

const POLICIES = [
  { to: '/privacy-policy', label: 'Privacy policy' },
  { to: '/terms-and-conditions', label: 'Terms and conditions' },
  { to: '/refund-policy', label: 'Refund policy' },
  { to: '/shipping-policy', label: 'Shipping policy' },
];

export default function Account() {
  const { parent, logout } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const dialogRef = useRef(null);
  const deleteButtonRef = useRef(null);

  /* Same focus trap as the sign-out dialog in Navbar.jsx, for the same reason:
     on a phone this is a full-screen decision with no pointer guaranteed, and
     `aria-modal` only fences off the page once focus is actually inside. */
  useEffect(() => {
    if (!confirming) return undefined;

    const dialog = dialogRef.current;
    const trigger = deleteButtonRef.current;

    const focusable = () =>
      [...dialog.querySelectorAll('input, button, [href], [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled);

    focusable()[0]?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setConfirming(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusable();
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [confirming]);

  const close = () => {
    setConfirming(false);
    setPassword('');
    setError('');
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');

    try {
      await API.delete('/parent/account', { data: { password } });
      // The token is already dead server-side; see AuthContext.logout.
      await logout({ sessionAlreadyEnded: true });
      navigate('/login?deleted=1', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't delete your account. Please try again.");
      setDeleting(false);
    }
  };

  if (!parent) return null;

  return (
    <>
      <PageHeader title="Your account" subtitle="Your details, our policies, and how to leave." />

      <Card>
        <dl className="account-details">
          <div>
            <dt>Name</dt>
            <dd>{parent.fatherName || '—'}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{parent.phone || '—'}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{parent.email || '—'}</dd>
          </div>
        </dl>
        <p className="account-note">
          Your school keeps these details. Ask the office to change them.
        </p>
      </Card>

      <Card>
        <h2 className="card-title">Policies</h2>
        <ul className="account-policy-list">
          {POLICIES.map((policy) => (
            <li key={policy.to}>
              <Link to={policy.to}>
                {policy.label}
                <Icon name="chevronRight" size={18} />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="account-danger">
        <h2 className="card-title">Delete your account</h2>
        <p>
          This closes your Hunger Hunt account and signs you out everywhere. You’ll stop
          receiving notifications, and you won’t be able to see your children’s balances or
          approve their purchases.
        </p>
        <p>
          Your children keep their wallets and their purchase history — those belong to the
          school, not to this app. To come back, ask the office for a new invitation.
        </p>
        <Button
          ref={deleteButtonRef}
          variant="danger"
          onClick={() => setConfirming(true)}
        >
          <Icon name="trash" size={18} /> Delete my account
        </Button>
      </Card>

      {confirming && (
        <div className="parent-modal-backdrop" onClick={close}>
          <div
            ref={dialogRef}
            className="parent-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="parent-modal-icon parent-modal-icon--alert" aria-hidden="true">
              <Icon name="trash" size={24} />
            </span>
            <h2 id="delete-account-title">Delete your account?</h2>
            <p>Enter your password to confirm. This cannot be undone from the app.</p>

            <PasswordField
              id="delete-account-password"
              label="Your password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />

            {error && <p className="account-dialog-error" role="alert">{error}</p>}

            <div className="parent-modal-actions">
              <Button variant="ghost" block disabled={deleting} onClick={close}>
                Keep my account
              </Button>
              <Button
                variant="danger"
                block
                disabled={deleting || !password}
                onClick={handleDelete}
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

`Button` currently does not forward a `ref`. Check `components/ui/index.jsx:36`; if it still doesn't, either wrap the trigger in a plain `<button className="btn btn--danger">` or add `ref` forwarding to `Button` — whichever matches how the rest of the codebase handles it. Do not leave a silently ignored `ref`.

- [ ] **Step 3: Add the route**

In `frontend-parent/src/App.jsx`, import `Account` alongside the other pages and add beside the other protected routes:

```jsx
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <Account />
            </ProtectedRoute>
          }
        />
```

- [ ] **Step 4: Add it to both navs**

In `frontend-parent/src/components/Navbar.jsx`, add a third entry to `parent-desktop-nav` and to `parent-bottom-nav`, matching the existing `NavLink` shape exactly:

```jsx
          <NavLink to="/account" className={navClass}>
            <Icon name="shield" size={18} /> Account
          </NavLink>
```

and in the bottom nav, `size={21}` with the label wrapped in `<span>`, like its neighbours. Check `parent.css` for a bottom-nav rule that assumes two items and widen it if there is one.

- [ ] **Step 5: Add the post-deletion banner**

In `frontend-parent/src/pages/Login.jsx`, beside the existing `expired` flag:

```jsx
  const deleted = searchParams.get('deleted') === '1';
```

and beside the existing expired banner, in the same markup shape:

```jsx
      {deleted && !error && (
        <Banner variant="ok">
          Your account has been deleted. Ask your school office if you want it back.
        </Banner>
      )}
```

Read the expired banner's actual markup at `Login.jsx:65-68` and copy its component and variant rather than assuming `Banner variant="ok"` exists — use whatever variant is already in use for non-error notices.

- [ ] **Step 6: Style the new page**

Append to `frontend-parent/src/parent.css`, matching the file's existing custom-property names (read the neighbouring rules for the real token names before writing):

```css
/* --- Account screen ------------------------------------------------- */

.account-details {
  display: grid;
  gap: 14px;
  margin: 0;
}

.account-details div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.account-details dt {
  color: var(--muted);
  font-size: 14px;
}

.account-details dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
  overflow-wrap: anywhere;
}

.account-note {
  margin: 16px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.account-policy-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}

.account-policy-list a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 0;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--line);
}

.account-policy-list li:last-child a {
  border-bottom: 0;
}

/* The one destructive surface in the app. It is set apart deliberately: a
   parent should not be able to arrive here by mistaking it for a settings
   toggle. */
.account-danger {
  border-color: var(--danger-line, #f0c6c6);
}

.account-danger p {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.55;
}

.account-dialog-error {
  margin: 12px 0 0;
  color: var(--danger, #b42318);
  font-size: 14px;
}
```

- [ ] **Step 7: Lint and build**

```bash
npm run lint --prefix frontend-parent
npm run build --prefix frontend-parent
```

Expected: 0 errors, 0 warnings; build succeeds.

- [ ] **Step 8: Verify by hand**

Start the backend and `npm run dev --prefix frontend-parent`. Sign in as a local dev parent (local Mongo, `hungerhunt_dev` — never production) and check:
- Account appears in both navs and the page renders all three sections.
- A wrong password shows the error inside the dialog and stays signed in — it must **not** bounce to `/login?expired=1`. This is the ordering trap; if it bounces, the interceptor is being triggered.
- A correct password lands on the login screen showing the deleted banner, not the expired one.
- Signing in again with the same credentials fails, because the account is archived.

- [ ] **Step 9: Commit**

```bash
git add frontend-parent/src/pages/Account.jsx frontend-parent/src/App.jsx \
        frontend-parent/src/components/Navbar.jsx frontend-parent/src/context/AuthContext.jsx \
        frontend-parent/src/pages/Login.jsx frontend-parent/src/parent.css
git commit -m "$(cat <<'EOF'
Give parents a way to read the policies and leave

The app had no settings screen, so a signed-in parent could not reach a
single policy page and had no way out that did not go through the office.
Deleting asks for the password in a dialog and lands on the login screen
saying so, rather than on the one that claims the session expired.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Say what deletion actually does, in the privacy policy

Retaining the row is defensible only if it is disclosed. This is also the text the store package quotes, so the two cannot drift.

**Files:**
- Modify: `frontend-parent/src/pages/PrivacyPolicy.jsx:74-86`

**Interfaces:**
- Consumes: the behaviour built in Tasks 2 and 3.
- Produces: the canonical deletion wording, quoted verbatim by `docs/store-listing.md` in Task 5.

- [ ] **Step 1: Replace section 6's second paragraph**

In `frontend-parent/src/pages/PrivacyPolicy.jsx`, replace the paragraph beginning "You may ask HungerHunt or your school administration for assistance with account deletion." with:

```jsx
        <p>
          You can delete your account yourself, from the app: open <strong>Account</strong> and
          choose <strong>Delete my account</strong>. You will be asked for your password. Deleting
          removes your ability to sign in, ends your sessions on every device, deletes your saved
          password, withdraws every device registered for notifications, and unlinks you from your
          children’s accounts. We cannot undo it from the app; the school can issue you a new
          invitation if you want to return.
        </p>
        <p>
          Deleting your account does not erase your children’s wallet balances or purchase history.
          Those records belong to the school, which uses them to run its canteen and account for
          money it holds on your child’s behalf, and they remain with the school after you leave.
          We also keep a minimal record of your account so that approvals and payments you made
          before deleting remain attributable. Deletion may be delayed while a purchase awaiting
          your approval, a payment, a grievance, or a legal obligation remains unresolved — the app
          will tell you if this applies to you.
        </p>
```

Also update the `Last updated` date in `components/PolicyPage.jsx` if the repo's convention is to move it when a policy changes — check whether any other policy edit in the log moved it before deciding.

- [ ] **Step 2: Lint and build**

```bash
npm run lint --prefix frontend-parent
npm run build --prefix frontend-parent
```

Expected: 0 errors, 0 warnings; build succeeds.

- [ ] **Step 3: Read it back on the running app**

Open `/privacy-policy` in the dev server and read section 6 as a parent would. It has to describe what Task 2 actually does — if the code and this paragraph disagree, the code is right and this changes.

- [ ] **Step 4: Commit**

```bash
git add frontend-parent/src/pages/PrivacyPolicy.jsx frontend-parent/src/components/PolicyPage.jsx
git commit -m "$(cat <<'EOF'
Say what deleting an account does and does not remove

The policy pointed at the school office, which is no longer the only way
out. It now names the route in the app, lists what deletion removes, and
says plainly that the children's balances and purchase history stay with
the school and why.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `docs/store-listing.md`

Every field both consoles ask for, answered once. Composed here so submission is copying.

**Files:**
- Create: `docs/store-listing.md`

**Interfaces:**
- Consumes: the deletion wording from Task 4; the PhonePe provider fact from `backend/models/PaymentIntent.js`.
- Produces: the file `RELEASE-CHECKLIST.md` points at in Task 9.

- [ ] **Step 1: Confirm the facts the privacy answers rest on**

Before writing a word, verify each of these in the code and note the file you confirmed it from — a Data Safety form is cross-checked against observed behaviour, so a guess here is a rejection later:

```bash
# What the app sends about a person
grep -rn "phone\|email\|fatherName" backend/controllers/parentController.js | head -20
# Push: what leaves the device and where it goes
grep -rn "fcm\|FirebaseMessaging\|firebase-admin" backend/utils/sendNotification.js backend/utils/pushTransport.js | head
# Payments: provider, and what it is told
grep -rn "phonepe" backend/src/domain/payments/providers/phonepe.js | head -20
# Anything analytics-shaped (expected: nothing)
grep -rn "analytics\|gtag\|mixpanel\|sentry" frontend-parent/src | head
```

- [ ] **Step 2: Write the file**

Create `docs/store-listing.md` with these sections, filled in — not sketched:

1. **How to use this file** — one paragraph: it is the source of truth for both consoles; when the app changes, this changes with it, and the privacy policy page is the third copy that must agree.
2. **Shared facts** — app name, bundle/application id `com.hungerhunt.parent`, category, contact email, support URL, marketing URL, privacy policy URL (the deployed parent app's `/privacy-policy`), current version.
3. **Apple — App Store Connect**, field by field: name (≤30), subtitle (≤30), promotional text (≤170), description, keywords (≤100 chars, comma-separated, no spaces), what's new, age rating answers, "is this app directed at children" answered **no** with the one-line reason (the data is about children; the account holder and only user is an adult), export compliance (uses encryption: yes, only standard HTTPS → exempt), push notification purpose (transactional account activity, not marketing).
4. **Apple — privacy nutrition labels**, per data type, each marked linked-to-user and not-used-for-tracking: name, phone number, email address, purchase history, financial info (payments), device identifiers (push token), diagnostics — plus the "not collected" categories stated explicitly, because leaving them blank and leaving them denied are different answers.
5. **Apple — review notes.** Write these out in full. They must cover:
   - Accounts are created by the school office and activated by the parent with a one-time code, so the reviewer cannot self-register; the supplied credentials are the only way in.
   - Account deletion is in-app at **Account → Delete my account**, and here is what it does — quoting Task 4's paragraph.
   - The IAP argument: money added to a child's wallet is spent on physical food collected from a school counter and hostel, a good consumed outside the app, so payments run through PhonePe under the physical-goods provision rather than in-app purchase. Say it plainly and up front.
   - Push notifications are transactional (a purchase awaiting approval, a wallet recharge).
6. **Google — Play Console**: title (≤30), short description (≤80), full description (≤4000), category, tags, contact details, target audience **18 and over**, "does your app appeal to children" **no**, ads **no**, content rating questionnaire answers question by question, App access → all functionality restricted, with the reviewer credentials placeholder and instructions.
7. **Google — Data Safety**, matching Apple's labels but in Google's shape, which asks three things Apple does not: collected *and* shared, encrypted in transit (yes), and deletion (yes, in-app, plus the URL). Declare the PhonePe and Firebase transfers as processing by service providers, and answer the "is data shared with third parties" question the way the code actually behaves.
8. **Reviewer account** — what the owner has to create: one parent account on production, fictional family, one child with a plausible balance and a handful of purchases, purchase code set. Credentials recorded here as `<<FILL IN, DO NOT COMMIT>>` placeholders with a line saying they go into the consoles directly and never into git.
9. **Copy that must stay in step** — a short list naming the three places the deletion and data statements live (this file, `PrivacyPolicy.jsx`, the app's own Account screen) so a future change touches all three.

Write the actual marketing copy. Single school, adults only, plain and specific: what a parent sees (their children's balances, what was bought, recharge history), what they can do (top up, approve purchases, set a four-digit purchase code, get notified). No claims the app does not deliver — the listing is cross-checked against the build.

- [ ] **Step 3: Check the length limits**

```bash
node -e '
const fs = require("fs");
const doc = fs.readFileSync("docs/store-listing.md", "utf8");
console.log("Read each field back and count it by hand against:");
console.log("Apple: name 30, subtitle 30, promo 170, keywords 100, description 4000");
console.log("Play: title 30, short description 80, full description 4000");
'
```

Then actually count the fields you wrote — a store rejects an over-length field at submission time, and the count is cheap now and expensive later.

- [ ] **Step 4: Commit**

```bash
git add docs/store-listing.md
git commit -m "$(cat <<'EOF'
Answer both stores' questions once, in one file

Every field App Store Connect and Play Console ask for, composed here so
submission is copying rather than writing. The privacy answers are read
out of the code — PhonePe for payments, Firebase for push, nothing for
analytics — because both forms are checked against what the app does.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Screenshot pipeline

The owner captures on real devices; this turns those captures into files each store accepts.

**Files:**
- Create: `docs/store-assets.md`
- Create: `scripts/store-screenshots.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `node scripts/store-screenshots.mjs <input-dir> <output-dir>` — reads PNG/JPEG captures, writes one correctly sized PNG per capture per required size.

- [ ] **Step 1: Confirm the tool exists before depending on it**

```bash
sips --version
```

Expected: a version string. `sips` ships with macOS; if it is missing, stop and say so rather than adding an npm dependency — the Global Constraints forbid one.

- [ ] **Step 2: Write the shot list**

Create `docs/store-assets.md` covering:

- **Required sizes.** Apple: 6.9" iPhone 1290×2796 (portrait), 6.5" iPhone 1242×2688. Play: phone screenshots between 320px and 3840px on a side with a max 2:1 aspect ratio, 2–8 of them, plus a 1024×500 feature graphic and a 512×512 app icon. Verify each of these against the current Apple and Google specification pages before shooting — they change, and the script's constants and this table must be updated together.
- **The shot list**, in listing order, each with what must be on screen:
  1. Dashboard — two children, distinct balances, one healthy and one low.
  2. Child detail — purchase list showing several real-looking items with prices.
  3. Purchase awaiting approval — the approve/decline card.
  4. Set purchase code — the four-digit number pad.
  5. Recharge / wallet top-up.
  6. A notification arriving (Android only; iOS review dislikes screenshots of system UI — check before including).
- **Capture from the reviewer's fictional family**, not from a real one. This removes the scrubbing problem at source rather than solving it afterwards.
- **What to check before sending**: no real names, no real phone numbers, status bar clean, no debug banner, and the build pointed at production.
- **How to run the script**, with a worked example.

- [ ] **Step 3: Write the script**

Create `scripts/store-screenshots.mjs`:

```js
#!/usr/bin/env node
/* Turn real-device captures into files each store will accept.
 *
 * A phone that is not a store reference device produces a capture of the wrong
 * pixel size, and a store rejects that at the end of the upload rather than at
 * the start. This scales each capture to fit the target and pads the remainder
 * with the app's background colour, so the aspect ratio never changes and
 * nothing is cropped out of a screenshot someone framed deliberately.
 *
 * Uses sips, which ships with macOS. No new dependency: see the plan's Global
 * Constraints.
 *
 * Usage: node scripts/store-screenshots.mjs <input-dir> <output-dir>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

/* Sizes come from Apple's and Google's published specifications, confirmed in
   Step 2 of this task. Both change without notice; re-check them alongside
   docs/store-assets.md, which carries the same table. */
const TARGETS = [
  { name: 'apple-6.9', width: 1290, height: 2796 },
  { name: 'apple-6.5', width: 1242, height: 2688 },
  { name: 'play-phone', width: 1080, height: 1920 },
];

// The parent app's own surface, so padding reads as part of the screenshot.
const PAD = 'FFFFFF';

const [, , inputDir, outputDir] = process.argv;

if (!inputDir || !outputDir) {
  console.error('Usage: node scripts/store-screenshots.mjs <input-dir> <output-dir>');
  process.exit(1);
}

if (!existsSync(inputDir)) {
  console.error(`No such directory: ${inputDir}`);
  process.exit(1);
}

const captures = readdirSync(inputDir)
  .filter((file) => /\.(png|jpe?g)$/i.test(file))
  .sort();

if (captures.length === 0) {
  console.error(`No PNG or JPEG captures in ${inputDir}`);
  process.exit(1);
}

for (const target of TARGETS) {
  const dir = join(outputDir, target.name);
  mkdirSync(dir, { recursive: true });

  for (const capture of captures) {
    const stem = basename(capture, extname(capture));
    const out = join(dir, `${stem}.png`);

    /* Two passes: fit inside the box preserving aspect ratio, then pad out to
       the exact size. sips's --resampleHeightWidthMax does the first without
       distorting; --padToHeightWidth does the second without cropping. */
    execFileSync('sips', [
      '-s', 'format', 'png',
      '--resampleHeightWidthMax', String(Math.max(target.width, target.height)),
      resolve(inputDir, capture),
      '--out', out,
    ], { stdio: 'ignore' });

    execFileSync('sips', [
      '--padToHeightWidth', String(target.height), String(target.width),
      '--padColor', PAD,
      out,
    ], { stdio: 'ignore' });

    console.log(`${target.name}/${stem}.png  ${target.width}×${target.height}`);
  }
}

console.log(`\n${captures.length} capture(s) → ${TARGETS.length} store size(s) in ${outputDir}`);
```

- [ ] **Step 4: Prove it on a real file**

```bash
mkdir -p /tmp/shots-in /tmp/shots-out
# Any PNG will do for the shape test; the app's own logo is to hand.
cp frontend-parent/resources/logo.png /tmp/shots-in/test.png
node scripts/store-screenshots.mjs /tmp/shots-in /tmp/shots-out
sips -g pixelWidth -g pixelHeight /tmp/shots-out/apple-6.9/test.png
```

Expected: `pixelWidth: 1290`, `pixelHeight: 2796`. If `--resampleHeightWidthMax` produces the wrong dimension for a landscape input, fix the script to branch on orientation and re-run — a store screenshot in the wrong orientation is rejected.

- [ ] **Step 5: Commit**

```bash
git add docs/store-assets.md scripts/store-screenshots.mjs
git commit -m "$(cat <<'EOF'
Take device captures to the sizes the stores demand

A handset that is not a store reference device produces the wrong pixel
size, and both stores refuse it at the end of the upload rather than the
start. This scales to fit and pads the rest, so nothing a screenshot was
framed around gets cropped away.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: The Play feature graphic

1024×500, required by Play, authored as HTML so the copy can change without redrawing anything.

**Files:**
- Create: `scripts/store-graphic/feature-graphic.html`
- Create: `scripts/render-store-graphic.mjs`

**Interfaces:**
- Consumes: the app name and positioning from `docs/store-listing.md` (Task 5).
- Produces: `node scripts/render-store-graphic.mjs [output.png]` → a 1024×500 PNG.

- [ ] **Step 1: Confirm the renderer**

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version
```

Expected: a version string.

- [ ] **Step 2: Write the graphic**

Create `scripts/store-graphic/feature-graphic.html` — a complete standalone page, exactly 1024×500, with no external requests (Play's graphic is a flat image; a webfont that fails to load renders a different picture than the one reviewed). Embed the logo as a data URI:

```bash
# Produces the data: URI to paste into the HTML.
node -e 'const fs=require("fs");console.log("data:image/png;base64,"+fs.readFileSync("frontend-parent/resources/logo.png").toString("base64"))' | head -c 120
```

Content: the Hunger Hunt mark, the app name, and one line of positioning taken verbatim from the short description in `docs/store-listing.md`. Play crops the feature graphic on some surfaces, so keep every element well inside the middle — do not put text near an edge. Use a system font stack with real fallbacks.

- [ ] **Step 3: Write the renderer**

Create `scripts/render-store-graphic.mjs`:

```js
#!/usr/bin/env node
/* Render the Play feature graphic to a 1024×500 PNG.
 *
 * The source is HTML rather than a drawn image so the copy can change without
 * anyone reopening a design tool, and so the file that produced the graphic is
 * in the repo next to the graphic itself.
 *
 * Uses the headless Chrome already installed. No new dependency.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SOURCE = resolve('scripts/store-graphic/feature-graphic.html');
const output = resolve(process.argv[2] || 'scripts/store-graphic/feature-graphic.png');

mkdirSync(dirname(output), { recursive: true });

execFileSync(CHROME, [
  '--headless',
  '--disable-gpu',
  '--hide-scrollbars',
  '--default-background-color=00000000',
  '--window-size=1024,500',
  `--screenshot=${output}`,
  `file://${SOURCE}`,
], { stdio: 'inherit' });

console.log(`Wrote ${output}`);
```

- [ ] **Step 4: Render it and check the size**

```bash
node scripts/render-store-graphic.mjs
sips -g pixelWidth -g pixelHeight scripts/store-graphic/feature-graphic.png
```

Expected: exactly `1024` × `500`. If Chrome's headless mode emits a different size, add `--force-device-scale-factor=1`; a 2× render is 2048×1000 and Play refuses it.

- [ ] **Step 5: Look at it**

Open the PNG. It has to read at thumbnail size on a phone — if the strapline is unreadable when the image is 300px wide, it is too long. Rewrite and re-render rather than shipping it.

- [ ] **Step 6: Commit**

```bash
git add scripts/store-graphic/ scripts/render-store-graphic.mjs
git commit -m "$(cat <<'EOF'
Draw the Play feature graphic from source we can edit

Play requires a 1024x500 banner. It is authored as HTML and rendered with
the Chrome already on the machine, so changing the strapline is an edit
and a re-run rather than a trip through a design tool.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Interim Android APK

Play's closed test takes 14 days minimum. Parents need the app before that, so the parent app gets the same sideload path the kiosk and warehouse already use — with its expiry written down.

**Files:**
- Modify: `frontend-parent/package.json:6-16` (scripts)
- Modify: `docs/android-apk-builds.md:1-12` and a new section

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `npm run apk:release --prefix frontend-parent` → `frontend-parent/android/app/build/outputs/apk/release/app-release.apk`

- [ ] **Step 1: Add the script**

In `frontend-parent/package.json`, beside `bundle:android`:

```json
    "apk:release": "npm run sync:release && cd android && ./gradlew :app:assembleRelease",
```

No gradle change is needed: the guard at `android/app/build.gradle:97-118` refuses any task matching `assemble|bundle|package…release` without a keystore, so the APK path inherits the same refusal the bundle path has.

- [ ] **Step 2: Verify the guard actually covers it**

```bash
cd frontend-parent/android && ./gradlew :app:assembleRelease --dry-run
```

With no `keystore.properties` and no keystore environment variables, expected: it **fails in about a second**, naming the values it could not find. If it instead plans an unsigned build, the task-name regex does not match `assembleRelease` and the guard needs widening — fix that before going further, because an unsigned APK is one nobody can install.

- [ ] **Step 3: Rewrite the doc's framing**

`docs/android-apk-builds.md` currently opens by saying it covers the kiosk and warehouse and explicitly **not** the parent app. Amend the opening so it is true: it now also covers the parent app's temporary APK, which is a different case from the other two and says so. Add a section:

```markdown
## The parent app's interim APK

The parent app is store-bound — unlike the two apps above, it has a Play
listing and an App Store listing, and everything in
[RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md) applies to it. It is here only
because Play will not let it through yet.

Google requires a personal developer account created after 13 November 2023 to
run a closed test with at least 12 opted-in testers for 14 continuous days
before it can even apply for production access. This account is one of those.
Until that clears, Android parents install a signed APK by hand:

```bash
VITE_API_BASE_URL=https://hungerhunt-dbat.onrender.com/api npm run apk:release --prefix frontend-parent
# → frontend-parent/android/app/build/outputs/apk/release/app-release.apk
```

Same keystore, same version rules and same production-API check as the Play
bundle: this is the release build, only delivered differently.

### The cost, which is not avoidable

Play App Signing means Google re-signs the app with its own key. An APK signed
with the upload key and a Play-installed build therefore carry **different
signatures**, and Android will not install one over the other. Every parent who
sideloads has to uninstall before the Play version will install — losing that
app's local state, including their session, so they sign in again.

This is inherent to Play App Signing, not a defect to fix later. Plan on
telling parents once, at the switchover, rather than letting them discover it
as a failed update.

### When this section goes

When the closed test clears and the app is on production Play, delete this
section and the `apk:release` script with it. An interim path that outlives its
reason becomes the path someone reaches for by habit.
```

- [ ] **Step 4: Commit**

```bash
git add frontend-parent/package.json docs/android-apk-builds.md
git commit -m "$(cat <<'EOF'
Ship the parent app to Android before Play will take it

Play holds a new personal account behind a 14-day closed test with a
dozen testers, so Android parents get the same signed release as an APK
installed by hand. Written down with its expiry, and with the one thing
that bites at the switchover: Google re-signs, so a sideloaded install
has to go before the Play one lands.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Bring `RELEASE-CHECKLIST.md` up to date

The checklist is the document someone reads at 11pm with a build waiting. It currently asks questions this plan has answered.

**Files:**
- Modify: `RELEASE-CHECKLIST.md` — the "Decide what the store listings say" block, the Android/Play items, and the verification block

**Interfaces:**
- Consumes: everything built in Tasks 1–8.
- Produces: nothing downstream.

- [ ] **Step 1: Replace the store-listing block**

The long "Decide what the store listings say" item currently restates the fields. Replace its body with a short item pointing at the two new files, keeping the paragraph that explains *why* this app's answer is not routine (it shows a named child's balance and spending to an adult identified by a phone number), and keeping the official reference links. The point is one source of truth, not two.

- [ ] **Step 2: Record account deletion as done**

Under the Apple items, replace the open account-deletion question with a statement of what shipped: in-app at **Account → Delete my account**, password-confirmed, archives the account server-side, ends every session, unlinks the children, and leaves the school's records intact — with the review-notes wording living in `docs/store-listing.md`.

- [ ] **Step 3: Record the Play closed-testing answer**

The checklist currently hedges ("If this is a new personal developer account…"). It is. Replace the conditional with the fact, the requirement (12 opted-in testers, 14 continuous days, before applying for production access), and a pointer to the interim APK section in `docs/android-apk-builds.md`.

- [ ] **Step 4: Extend the verification block**

In section 3, the backend test count in the comment beside `npm test --prefix backend` is now wrong. Run it, and update the number:

```bash
npm test --prefix backend 2>&1 | tail -5
```

In section 5 (smoke test), add a step:

```markdown
- [ ] Open **Account**: your own details are right, all four policy pages open,
      and **Delete my account** refuses a wrong password inside the dialog
      without signing you out. Do not complete the deletion on a real account.
```

- [ ] **Step 5: Read the whole file through**

Top to bottom, as someone who has never seen it. Anything that contradicts what Tasks 1–8 built is now wrong and gets fixed in this pass — that is what this task is for.

- [ ] **Step 6: Run the full verification suite**

Everything the checklist's own section 3 lists, so the plan ends on a checklist that has been exercised rather than only edited:

```bash
npm test --prefix backend
npm test --prefix frontend-parent
npm run lint --prefix frontend-parent
npm run lint --prefix hungerhunt-kiosk
npm run build --prefix frontend-parent
npm run build --prefix frontend-admin
npm run build --prefix hungerhunt-kiosk
node scripts/check-shared-files.mjs
```

Expected: all pass. `check-shared-files.mjs` matters here — `utils/validation.js` is duplicated across apps and this plan touches neighbouring code.

- [ ] **Step 7: Commit**

```bash
git add RELEASE-CHECKLIST.md
git commit -m "$(cat <<'EOF'
Stop the checklist asking questions we have answered

Account deletion shipped, the store answers moved into their own file,
and Play's closed-test requirement is a fact about this account rather
than a conditional. The smoke test gains the Account screen.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Not in this plan — the owner's work

Recorded so nothing here is mistaken for done. Full list in the spec's Boundary section.

- Create and back up the release keystore (password typed at the prompt, never on a command line).
- Xcode: distribution certificate, provisioning profile, archive against a physical-device destination.
- Both consoles: paste in the listing fields, complete the privacy forms and content rating, upload.
- Create the reviewer parent account and its fictional family on production, and put the credentials into both consoles — not into git.
- Capture the screenshots on real devices, then run Task 6's script over them.
- Recruit 12 testers and start the 14-day closed test.
- **Test iOS push on a physical iPhone.** Never done. The device will be in hand for the screenshots anyway, and a green build proves nothing — `AppDelegate.swift` guards Firebase behind `#if canImport`, so it compiles identically with the SDK absent.
