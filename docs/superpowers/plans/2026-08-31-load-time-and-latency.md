# Load Time & Latency Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut perceived load times across the four frontends and the API without leaving Render's free tier: keep the backend warm during school hours, compress and cache staff catalogue reads, serve right-sized images, split oversized bundles, snapshot the kiosk menu, and open connections early.

**Architecture:** The backend gains two small middleware additions (gzip via `compression`, an in-process read cache keyed on the existing data-revision counter). The frontends gain a shared Cloudinary URL transformer, lazy routes, a localStorage menu snapshot for the kiosk, and preconnect hints. A GitHub Actions cron pings `/health` every 10 minutes during 08:00–22:00 IST only — outside that window the free Render instance is allowed to spin down, by explicit owner decision.

**Tech Stack:** Express 4 (ESM) + `compression`, node:test with model-level mocks (backend and warehouse utils), Vitest (kiosk utils), React 19 + `React.lazy`, Vite HTML env replacement (`%VITE_API_BASE_URL%`), GitHub Actions cron, Cloudinary URL transformations.

**Spec:** No standalone spec file — the requirements are the owner's directives from the 2026-08-31 conversation, restated here:

1. Keep-warm ping only; stay on the free Render tier. The backend **may spin down 22:00–08:00 IST** — do not ping in that window.
2. Add response compression.
3. Server-side hot-read cache for catalogue-shaped staff reads, invalidated by the existing data-revision counter.
4. `Cache-Control` with `stale-while-revalidate` on those same reads.
5. Cloudinary `f_auto,q_auto,w_<size>` delivery transformations for product images.
6. Route-level code splitting where bundles are still monolithic (warehouse, parent — admin is already lazy).
7. Render-then-revalidate client snapshot, applied to the kiosk menu (the pattern already half-exists there).
8. `preconnect` hints to the API origin and Cloudinary.

**Hard exclusion (owner-confirmed):** never cache per-student or money data — wallet balances, purchase codes, purchase allowances, package state. The server cache therefore refuses any request with `req.student`, and the kiosk snapshot stores only the menu rows.

## Global Constraints

- Free Render tier stays. Keep-warm pings run **08:00–22:00 IST only** (02:30–16:30 UTC); overnight cold starts are accepted, not a bug.
- Never cache per-student data (see hard exclusion above). Staff-read staleness of up to 30s is accepted; purchase/stock correctness stays enforced server-side at write time.
- Backend tests: `cd backend && node --test tests/<file>.test.js`; full suite `npm test`. Warehouse utils: `cd hungerhunt-warehouse && npm run test`. Kiosk utils: `cd hungerhunt-kiosk && npx vitest run`.
- `node scripts/check-shared-files.mjs` must pass after any change to a shared file. Task 4 adds `src/utils/cloudinaryThumb.js` to its list.
- Commit messages follow the repo's narrative style (a single sentence about intent, e.g. "Teach the wallet and purchase ledgers where UPI money comes from"), ending with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
- Work on a feature branch (e.g. `performance-passes`), ideally in a worktree via superpowers:using-git-worktrees — the main working tree carries unrelated in-progress work.
- After each frontend task: `npm run lint` and `npx vite build` in that app must pass.

---

### Task 1: Keep-warm ping, school hours only

**Files:**
- Create: `.github/workflows/keep-warm.yml`

**Interfaces:**
- Consumes: the existing `GET /health` endpoint (`backend/app.js`, returns 200 when Mongo is connected).
- Produces: nothing other tasks depend on.

Render's free tier spins the service down after ~15 idle minutes; a ping every 10 minutes keeps it up. GitHub Actions cron is in UTC: 08:00 IST = 02:30 UTC, 22:00 IST = 16:30 UTC, so the window needs three cron lines (the half-hour edges can't ride the `*/10` line).

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/keep-warm.yml
#
# Render's free tier spins the backend down after ~15 idle minutes, and the
# first request afterwards eats the wake-up. Ping /health every 10 minutes —
# but only between 08:00 and 22:00 IST (02:30–16:30 UTC). Overnight the
# service is allowed to sleep: that window was chosen deliberately, do not
# widen it.
#
# Caveats to know before "fixing" this:
# - GitHub pauses scheduled workflows after ~60 days without repo activity;
#   a commit or a manual run resumes them.
# - Cron here is UTC. The odd-looking edge lines are the IST half-hour offset.
# - The first morning ping (02:30 UTC) IS the wake-up and may take ~60s; the
#   generous --max-time is for that request, not the steady state.
name: keep-warm

on:
  schedule:
    - cron: '30,40,50 2 * * *'   # 08:00–08:59 IST
    - cron: '*/10 3-15 * * *'    # 08:30–21:30 IST core window
    - cron: '0,10,20,30 16 * * *' # 21:30–22:00 IST tail
  workflow_dispatch:

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping backend health endpoint
        env:
          HEALTH_URL: ${{ vars.BACKEND_HEALTH_URL || 'https://hungerhunt-dbat.onrender.com/health' }}
        run: |
          curl --fail --silent --show-error --max-time 90 --retry 2 --retry-delay 5 "$HEALTH_URL"
```

- [ ] **Step 2: Verify the cron window math**

Read the three cron lines and confirm against IST (UTC+5:30): first firing 02:30 UTC = 08:00 IST, last firing 16:30 UTC = 22:00 IST, and no gap between consecutive pings ever exceeds 10 minutes inside the window. (This is a review step — cron has no local test harness.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/keep-warm.yml
git commit -m "Keep the backend awake during school hours and let it sleep at night

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Verify live after the branch is pushed/merged**

Trigger once by hand: GitHub → Actions → keep-warm → Run workflow. Expected: green run, curl prints the health JSON. Tell the owner: (a) if the real Render URL differs from `hungerhunt-dbat.onrender.com`, set repo Actions variable `BACKEND_HEALTH_URL`; (b) scheduled workflows pause after ~60 days of repo inactivity.

---

### Task 2: gzip compression on API responses

**Files:**
- Modify: `backend/package.json` (add `compression` dependency)
- Modify: `backend/app.js` (register middleware)
- Test: `backend/tests/compression.test.js`

**Interfaces:**
- Consumes: `GET /api/inventory` (staff branch of `getInventory` in `backend/controllers/inventoryController.js`) as the big-payload test target.
- Produces: nothing other tasks call; every JSON response > 1KB ships gzipped from here on.

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/compression.test.js
import test, { after, afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.FEATURE_V1_PROCUREMENT = 'true';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const asWarehouse = () => {
  mock.method(Admin, 'exists', async (filter) => {
    const allowed = filter.$or?.find((branch) => branch.role?.$in)?.role.$in || [];
    return String(filter._id) === STAFF_ID && allowed.includes('warehouse')
      ? { _id: STAFF_ID }
      : null;
  });
};

// Forty rows pushes the JSON body well past compression's 1KB threshold.
const bigShelf = () =>
  mock.method(Inventory, 'find', () => ({
    populate: async () =>
      Array.from({ length: 40 }, (_, index) => ({
        productId: { name: `Product ${String(index).padStart(2, '0')}`, active: true },
        stock: 5,
        toObject() {
          return { productId: this.productId, stock: this.stock };
        },
      })),
  }));

describe('response compression', () => {
  test('a large JSON body is gzipped when the client accepts it', async () => {
    asWarehouse();
    bigShelf();

    const response = await fetch(`${base}/api/inventory`, {
      headers: {
        Authorization: `Bearer ${warehouseToken}`,
        'Accept-Encoding': 'gzip',
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), 'gzip');
    // fetch decompresses transparently; the payload must survive the trip.
    const body = await response.json();
    assert.equal(body.length, 40);
  });
});
```

**Note for the implementer:** `Inventory.find(...)` in `getInventory` is called as `Inventory.find().populate({...})` and the result is awaited — check the exact call chain in `backend/controllers/inventoryController.js` and shape the mock so the awaited value is the array above. If the controller `await`s the populate chain differently (e.g. a thenable query), adapt the mock, not the controller.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/compression.test.js`
Expected: FAIL — `content-encoding` is `null` because nothing compresses yet. If it fails on the mock shape instead (500 from the route), fix the mock until the only failure is the missing header.

- [ ] **Step 3: Install and register compression**

Run: `cd backend && npm install compression`

In `backend/app.js`, add to the import block:

```js
import compression from 'compression';
```

Register it with the other early global middleware — immediately after the `helmet` registration (search `app.use(helmet`), before any route mounting:

```js
// Gzip every compressible response above the default 1KB threshold. The
// catalogue and order lists are the payloads that matter; tiny health checks
// stay uncompressed on purpose.
app.use(compression());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test tests/compression.test.js`
Expected: PASS

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all pass (compression must not disturb any existing body/header assertion).

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/app.js backend/tests/compression.test.js
git commit -m "Gzip API responses so the catalogue stops paying full fare

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: In-process read cache + Cache-Control for staff catalogue reads

**Files:**
- Create: `backend/middleware/readCache.js`
- Modify: `backend/routes/inventoryRoutes.js` (GET `/`)
- Modify: `backend/routes/productRoutes.js` (GET `/`)
- Test: `backend/tests/readCache.test.js`

**Interfaces:**
- Consumes: `currentDataRevision()` from `backend/middleware/dataRevision.js` (module-level counter, bumps on every successful mutating request).
- Produces: `readCache({ maxAgeSeconds?, staleWhileRevalidateSeconds?, revisionSource? })` → Express middleware. Mounted **after** auth middleware on exactly two routes. Sets `Cache-Control: private, max-age=30, stale-while-revalidate=60` and `X-Read-Cache: hit` on cache hits.

Safety model, in order: (1) GET only; (2) any request with `req.student` bypasses everything — student inventory payloads embed per-student purchase allowances; (3) entries are keyed by `req.originalUrl` (covers `?all=` variants) and are valid only while the data revision is unchanged, so any successful write anywhere invalidates the whole cache at once. `revisionSource` is injectable purely so tests can drive invalidation without making HTTP writes.

- [ ] **Step 1: Write the failing tests**

```js
// backend/tests/readCache.test.js
import test, { after, afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.FEATURE_V1_PROCUREMENT = 'true';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { readCache } = await import('../middleware/readCache.js');
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const asWarehouse = () => {
  mock.method(Admin, 'exists', async (filter) => {
    const allowed = filter.$or?.find((branch) => branch.role?.$in)?.role.$in || [];
    return String(filter._id) === STAFF_ID && allowed.includes('warehouse')
      ? { _id: STAFF_ID }
      : null;
  });
};

const shelf = () =>
  mock.method(Inventory, 'find', () => ({
    populate: async () => [
      {
        productId: { name: 'Apple Juice', active: true },
        stock: 5,
        toObject() {
          return { productId: this.productId, stock: this.stock };
        },
      },
    ],
  }));

// Minimal req/res doubles for unit-testing the middleware itself.
const makeReq = (overrides = {}) => ({ method: 'GET', originalUrl: '/api/inventory', ...overrides });
const makeRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) { this.headers[name] = value; return this; },
    type() { return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = JSON.stringify(body); return this; },
  };
  return res;
};

describe('readCache unit behaviour', () => {
  test('a stable revision serves the second read from memory', () => {
    const middleware = readCache({ revisionSource: () => 7 });

    let handled = 0;
    const first = makeRes();
    middleware(makeReq(), first, () => { handled += 1; first.json([{ name: 'Apple Juice' }]); });

    const second = makeRes();
    middleware(makeReq(), second, () => { handled += 1; });

    assert.equal(handled, 1);
    assert.equal(second.headers['X-Read-Cache'], 'hit');
    assert.equal(second.body, JSON.stringify([{ name: 'Apple Juice' }]));
    assert.match(second.headers['Cache-Control'], /max-age=30/);
    assert.match(second.headers['Cache-Control'], /stale-while-revalidate=60/);
  });

  test('a bumped revision throws the entry away', () => {
    let revision = 1;
    const middleware = readCache({ revisionSource: () => revision });

    let handled = 0;
    const first = makeRes();
    middleware(makeReq(), first, () => { handled += 1; first.json(['old']); });

    revision = 2;
    const second = makeRes();
    middleware(makeReq(), second, () => { handled += 1; second.json(['new']); });

    assert.equal(handled, 2);
    assert.equal(second.body, JSON.stringify(['new']));
  });

  test('a student request is never cached and never served from cache', () => {
    const middleware = readCache({ revisionSource: () => 7 });

    // Prime the cache with a staff read of the same URL.
    const staffRes = makeRes();
    middleware(makeReq(), staffRes, () => staffRes.json(['staff view']));

    let handled = 0;
    const studentRes = makeRes();
    middleware(makeReq({ student: { id: 'someone' } }), studentRes, () => { handled += 1; });

    assert.equal(handled, 1);
    assert.equal(studentRes.headers['X-Read-Cache'], undefined);
    assert.equal(studentRes.headers['Cache-Control'], undefined);
  });

  test('an error response is not stored', () => {
    const middleware = readCache({ revisionSource: () => 7 });

    const first = makeRes();
    middleware(makeReq(), first, () => { first.statusCode = 500; first.json({ error: 'boom' }); });

    let handled = 0;
    const second = makeRes();
    middleware(makeReq(), second, () => { handled += 1; second.json(['fine now']); });

    assert.equal(handled, 1);
    assert.equal(second.body, JSON.stringify(['fine now']));
  });
});

describe('readCache wired onto the inventory route', () => {
  test('two staff reads hit the database once and carry Cache-Control', async () => {
    asWarehouse();
    const find = shelf();

    const headers = { Authorization: `Bearer ${warehouseToken}` };
    const first = await fetch(`${base}/api/inventory`, { headers });
    const second = await fetch(`${base}/api/inventory`, { headers });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(find.mock.callCount(), 1);
    assert.equal(second.headers.get('x-read-cache'), 'hit');
    assert.match(second.headers.get('cache-control'), /max-age=30/);
    assert.deepEqual(await second.json(), await first.json());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test tests/readCache.test.js`
Expected: FAIL at the import — `../middleware/readCache.js` does not exist.

- [ ] **Step 3: Write the middleware**

```js
// backend/middleware/readCache.js
import { currentDataRevision } from './dataRevision.js';

/* A per-process cache for staff reads of catalogue-shaped data.
 *
 * The whole cache keys its validity on the data-revision counter: any
 * successful write anywhere bumps it, so nothing here can outlive the data it
 * was read from by more than one in-flight request. That is why there is no
 * TTL and no eviction — entries die the moment the world changes, and the
 * handful of catalogue URLs this guards cannot grow the map without limit.
 *
 * Student requests bypass everything, both reading and writing the cache:
 * the student inventory payload embeds per-student purchase allowances, and a
 * cache that could show one student another's allowance — or a stale one
 * right after their own purchase — is worse than no cache. Money and package
 * state never pass through here at all; do not mount this middleware on
 * routes that carry them.
 *
 * revisionSource exists for tests, which need to move the revision without
 * performing a real write. Production callers never pass it. */
export const readCache = ({
  maxAgeSeconds = 30,
  staleWhileRevalidateSeconds = 60,
  revisionSource = currentDataRevision,
} = {}) => {
  const entries = new Map();
  const cacheControl =
    `private, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`;

  return (req, res, next) => {
    if (req.method !== 'GET' || req.student) return next();

    const key = req.originalUrl;
    const revision = revisionSource();

    const entry = entries.get(key);
    if (entry && entry.revision === revision) {
      res.set('Cache-Control', cacheControl);
      res.set('X-Read-Cache', 'hit');
      return res.type('application/json').send(entry.body);
    }

    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        entries.set(key, { revision, body: JSON.stringify(body) });
        res.set('Cache-Control', cacheControl);
      }
      return json(body);
    };

    return next();
  };
};
```

- [ ] **Step 4: Mount it on the two routes**

In `backend/routes/inventoryRoutes.js`:

```js
import { readCache } from "../middleware/readCache.js";
```

and change the GET line to:

```js
// Cached for staff only — a student's payload carries their own purchase
// allowances and must be computed fresh; readCache steps aside for them.
router.get("/", orStudent(protectAnyStaff), readCache(), getInventory);
```

In `backend/routes/productRoutes.js`:

```js
import { readCache } from '../middleware/readCache.js';
```

and change the GET line to:

```js
router.get('/', protectWarehouse, readCache(), getProducts);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && node --test tests/readCache.test.js`
Expected: PASS (all five).

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all pass. Watch specifically for existing tests that GET `/api/inventory` or `/api/products` twice with different mocks in one process — if one fails on stale cached data, that test now needs a revision bump between reads; prefer adjusting the test's expectations to reality (e.g. perform the reads in separate subtests with distinct URLs) over weakening the middleware.

- [ ] **Step 7: Commit**

```bash
git add backend/middleware/readCache.js backend/routes/inventoryRoutes.js backend/routes/productRoutes.js backend/tests/readCache.test.js
git commit -m "Serve staff catalogue reads from memory until the data actually changes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Cloudinary delivery transformations for product images

**Files:**
- Create: `hungerhunt-warehouse/src/utils/cloudinaryThumb.js` (canonical copy)
- Create: `hungerhunt-kiosk/src/utils/cloudinaryThumb.js` (byte-identical copy)
- Create: `frontend-admin/src/utils/cloudinaryThumb.js` (byte-identical copy)
- Modify: `scripts/check-shared-files.mjs` (add the new shared entry)
- Modify: `hungerhunt-warehouse/src/components/ProductThumb.jsx`
- Modify: `hungerhunt-kiosk/src/pages/KioskBilling.jsx` (product/nutrition `<img>` tags)
- Modify: `frontend-admin/src/pages/Products.jsx` (product `<img>` tag)
- Test: `hungerhunt-warehouse/src/utils/cloudinaryThumb.test.js`

**Interfaces:**
- Consumes: `Product.image` values — full Cloudinary `secure_url` strings like `https://res.cloudinary.com/<cloud>/image/upload/v169.../products/x.jpg` (see `uploadImage` in `backend/controllers/productController.js`). The stored URL is untouched; only rendering changes.
- Produces: `cloudinaryThumb(url, width = 144)` → string. Inserts `f_auto,q_auto,c_limit,w_<width>/` after `/image/upload/`; returns any non-Cloudinary, empty, or already-transformed URL unchanged.

- [ ] **Step 1: Write the failing test**

```js
// hungerhunt-warehouse/src/utils/cloudinaryThumb.test.js
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { cloudinaryThumb } from './cloudinaryThumb.js';

const UPLOADED =
  'https://res.cloudinary.com/demo/image/upload/v1690000000/products/juice.jpg';

describe('sizing a Cloudinary image for delivery', () => {
  test('inserts format, quality and width after the upload segment', () => {
    assert.equal(
      cloudinaryThumb(UPLOADED, 144),
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_144/v1690000000/products/juice.jpg'
    );
  });

  test('defaults to 144 pixels wide', () => {
    assert.match(cloudinaryThumb(UPLOADED), /w_144\//);
  });

  test('leaves a non-Cloudinary URL alone', () => {
    assert.equal(cloudinaryThumb('https://example.com/juice.jpg', 144), 'https://example.com/juice.jpg');
  });

  test('leaves empty and missing values alone', () => {
    assert.equal(cloudinaryThumb('', 144), '');
    assert.equal(cloudinaryThumb(null, 144), null);
    assert.equal(cloudinaryThumb(undefined, 144), undefined);
  });

  test('does not transform twice', () => {
    const once = cloudinaryThumb(UPLOADED, 144);
    assert.equal(cloudinaryThumb(once, 144), once);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd hungerhunt-warehouse && npm run test`
Expected: FAIL — module `./cloudinaryThumb.js` not found. The 16 existing util tests keep passing.

- [ ] **Step 3: Write the util**

```js
// hungerhunt-warehouse/src/utils/cloudinaryThumb.js
/* Product images are stored as full Cloudinary secure_urls pointing at the
   original upload. Delivering the original to a 56-pixel tile wastes most of
   the bytes, so rendering inserts a transformation instead: f_auto/q_auto let
   Cloudinary's CDN pick WebP/AVIF and a sane quality, c_limit,w_ caps the
   width without ever upscaling. The stored URL is never rewritten — this is a
   read-side decoration only, and any URL this function does not positively
   recognise passes through untouched. */
const UPLOAD_MARKER = '/image/upload/';

export const cloudinaryThumb = (url, width = 144) => {
  if (typeof url !== 'string' || !url.includes('res.cloudinary.com')) return url;

  const at = url.indexOf(UPLOAD_MARKER);
  if (at === -1) return url;

  const cut = at + UPLOAD_MARKER.length;
  if (url.slice(cut).startsWith('f_auto')) return url;

  return `${url.slice(0, cut)}f_auto,q_auto,c_limit,w_${width}/${url.slice(cut)}`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd hungerhunt-warehouse && npm run test`
Expected: PASS (all suites).

- [ ] **Step 5: Copy the util to the other two apps and register it as shared**

```bash
cp hungerhunt-warehouse/src/utils/cloudinaryThumb.js hungerhunt-kiosk/src/utils/cloudinaryThumb.js
cp hungerhunt-warehouse/src/utils/cloudinaryThumb.js frontend-admin/src/utils/cloudinaryThumb.js
```

In `scripts/check-shared-files.mjs`, append to the `SHARED` array (after the `availability.js` entry):

```js
  // Read-side Cloudinary sizing for product images. Three apps render the
  // same stored secure_urls; the transformation rule must not drift or the
  // same product renders at different quality per app.
  {
    file: 'src/utils/cloudinaryThumb.js',
    apps: ['frontend-admin', 'hungerhunt-kiosk', 'hungerhunt-warehouse'],
  },
```

Run: `node scripts/check-shared-files.mjs` — expected: all in sync, including the new entry.

- [ ] **Step 6: Wire it into the three rendering sites**

Warehouse — `hungerhunt-warehouse/src/components/ProductThumb.jsx`: import the util and request 2× the display size for sharp rendering on high-DPR phones. Change the `<img ... src={src} ...>` to:

```jsx
import { cloudinaryThumb } from "../utils/cloudinaryThumb";
```

```jsx
      src={cloudinaryThumb(src, size * 2)}
```

Kiosk — `hungerhunt-kiosk/src/pages/KioskBilling.jsx`: import the util, then wrap the product image sources (search for `<img` — as of writing: the category tile `category.image`, menu tile `item.image || PLACEHOLDER`, cart line `p.image || PLACEHOLDER`, nutrition sheet `nutritionFor.image || PLACEHOLDER`). Menu/category/cart tiles get width 320; the nutrition sheet's larger image gets 640:

```jsx
import { cloudinaryThumb } from "../utils/cloudinaryThumb";
```

```jsx
<img src={cloudinaryThumb(category.image, 320)} alt="" />
```
```jsx
<img src={cloudinaryThumb(item.image || PLACEHOLDER, 320)} alt="" />
```
```jsx
<img src={cloudinaryThumb(p.image || PLACEHOLDER, 320)} alt="" />
```
```jsx
<img src={cloudinaryThumb(nutritionFor.image || PLACEHOLDER, 640)} alt="" />
```

(`PLACEHOLDER` is a local asset; `cloudinaryThumb` passes it through untouched, which is the point of the passthrough rule.)

Admin — `frontend-admin/src/pages/Products.jsx`: find the product `<img>` (search `<img`), import the util, and wrap its `src` the same way with width 320. Match whatever fallback expression is already there — wrap the whole expression, do not restructure it.

- [ ] **Step 7: Lint and build all three apps**

Run in each of `hungerhunt-warehouse`, `hungerhunt-kiosk`, `frontend-admin`: `npm run lint && npx vite build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add hungerhunt-warehouse/src/utils/cloudinaryThumb.js hungerhunt-warehouse/src/utils/cloudinaryThumb.test.js hungerhunt-kiosk/src/utils/cloudinaryThumb.js frontend-admin/src/utils/cloudinaryThumb.js scripts/check-shared-files.mjs hungerhunt-warehouse/src/components/ProductThumb.jsx hungerhunt-kiosk/src/pages/KioskBilling.jsx frontend-admin/src/pages/Products.jsx
git commit -m "Let Cloudinary size and format product images instead of shipping originals

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Route-level code splitting (warehouse and parent apps)

**Files:**
- Modify: `hungerhunt-warehouse/src/App.jsx`
- Modify: `frontend-parent/src/App.jsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on. `frontend-admin` is already fully lazy (see its `App.jsx`) — do not touch it. The kiosk is one page — do not touch it.

- [ ] **Step 1: Convert warehouse page imports to lazy**

In `hungerhunt-warehouse/src/App.jsx`, replace the eager page imports (`Login`, `Orders`, `Inventory`, `Purchases`, `Receive`, `Records`, `CaretakerOrders`, `CaretakerReports`, `CollectOrder` — match the import list actually present in the file) with:

```jsx
import { lazy, Suspense, useEffect } from "react";
```

```jsx
const Login = lazy(() => import("./pages/Login"));
const Orders = lazy(() => import("./pages/Orders"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Purchases = lazy(() => import("./pages/Purchases"));
const Receive = lazy(() => import("./pages/Receive"));
const Records = lazy(() => import("./pages/Records"));
const CaretakerOrders = lazy(() => import("./pages/CaretakerOrders"));
const CaretakerReports = lazy(() => import("./pages/CaretakerReports"));
const CollectOrder = lazy(() => import("./pages/CollectOrder"));
```

Keep `ProtectedRoute`, `Icon`, and util imports eager — they are small and every route needs them.

In the `App` component, wrap the top-level `<Routes>` in one Suspense boundary so every lazy chunk resolves inside it (the fallback is a bare themed shell, not a spinner — chunk loads on a LAN are near-instant and a flash of spinner is worse than a beat of background):

```jsx
    <Suspense fallback={<div className="wh-app wh-app--single" />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<StaffRoutes />} />
      </Routes>
    </Suspense>
```

- [ ] **Step 2: Convert parent app page imports the same way**

In `frontend-parent/src/App.jsx`, apply the same pattern to its page imports (`Login`, `Activate`, `Dashboard`, `Accounts`, `ChildDetails`, `ForgotPassword`, `ResetPassword`, `SetPurchasePassword`, plus any other `./pages/*` imports present — enumerate from the file, not from this list). Keep context providers (`AuthProvider`) and hooks eager. Wrap the router's `<Routes>` in `<Suspense fallback={null}>`.

- [ ] **Step 3: Verify the split in the build output**

Run in both apps: `npm run lint && npx vite build`
Expected: lint clean; the build output lists one JS chunk per lazy page (e.g. `CaretakerOrders-<hash>.js`) instead of a single `index-<hash>.js` carrying everything, and the main chunk shrinks accordingly. If the warehouse main chunk is not meaningfully smaller than the ~354 KB it was, something is still eagerly imported — check for a stray static import of a page.

- [ ] **Step 4: Smoke the warehouse app**

Run: `cd hungerhunt-warehouse && npm run dev`, sign in as a caretaker (dev seed accounts: `backend/scripts/seedDevAccounts.js` against local Mongo), and click through packages → collect screen → reports. Expected: no blank screens, no chunk-load errors in the console. Repeat briefly for a warehouse-role login.

- [ ] **Step 5: Commit**

```bash
git add hungerhunt-warehouse/src/App.jsx frontend-parent/src/App.jsx
git commit -m "Load each screen's code when it is opened, not at the front door

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Kiosk menu snapshot — render last menu instantly, revalidate behind it

**Files:**
- Create: `hungerhunt-kiosk/src/utils/menuSnapshot.js`
- Modify: `hungerhunt-kiosk/src/pages/KioskBilling.jsx`
- Test: `hungerhunt-kiosk/src/utils/menuSnapshot.test.js`

**Interfaces:**
- Consumes: the kiosk's existing catalogue flow in `KioskBilling.jsx` — `loadInventory()` maps `GET /api/inventory` rows through `toProduct` and `applyInventory({ products, error })` commits them via `setProducts(next)` only when there is no error (the "last good catalogue" comment marks the spot).
- Produces: `loadMenuSnapshot()` → array (possibly empty), `saveMenuSnapshot(rows)` → void. Snapshot holds **menu rows only** — product names, prices, images, availability flags. No wallet, no codes, no student identity (global hard exclusion).

The kiosk already keeps the last good catalogue *in memory*; this persists the same rows to localStorage so the very first paint after an app launch shows the menu instead of an empty grid. The fetch still runs on mount and replaces the snapshot; the existing availability guard already tolerates stale rows in the window between paint and refresh.

- [ ] **Step 1: Write the failing test**

```js
// hungerhunt-kiosk/src/utils/menuSnapshot.test.js
import { beforeEach, describe, expect, test } from 'vitest';

import { loadMenuSnapshot, saveMenuSnapshot } from './menuSnapshot';

// A self-contained localStorage stub — the util must survive environments
// where storage is absent, full, or holding garbage.
const store = new Map();
let failWrites = false;

beforeEach(() => {
  store.clear();
  failWrites = false;
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      if (failWrites) throw new Error('QuotaExceededError');
      store.set(key, String(value));
    },
  };
});

describe('the kiosk menu snapshot', () => {
  test('round-trips the menu rows', () => {
    const rows = [{ _id: 'p1', name: 'Apple Juice', price: 25, image: '' }];
    saveMenuSnapshot(rows);
    expect(loadMenuSnapshot()).toEqual(rows);
  });

  test('an empty store loads as an empty menu', () => {
    expect(loadMenuSnapshot()).toEqual([]);
  });

  test('garbage in storage loads as an empty menu, not a crash', () => {
    saveMenuSnapshot([{ _id: 'p1' }]);
    store.set([...store.keys()][0], '{not json');
    expect(loadMenuSnapshot()).toEqual([]);
  });

  test('a non-array in storage loads as an empty menu', () => {
    saveMenuSnapshot([{ _id: 'p1' }]);
    store.set([...store.keys()][0], '{"sneaky":"object"}');
    expect(loadMenuSnapshot()).toEqual([]);
  });

  test('a full or blocked store swallows the write', () => {
    failWrites = true;
    expect(() => saveMenuSnapshot([{ _id: 'p1' }])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd hungerhunt-kiosk && npx vitest run src/utils/menuSnapshot.test.js`
Expected: FAIL — module `./menuSnapshot` not found.

- [ ] **Step 3: Write the util**

```js
// hungerhunt-kiosk/src/utils/menuSnapshot.js
/* The last menu this till successfully showed, persisted so the next launch
   paints it immediately while the real fetch runs behind it. Menu rows only —
   names, prices, images, availability. Nothing about any student, wallet or
   code ever goes in here, and nothing here is trusted for a sale: the
   availability guard and the server re-check everything at purchase time.

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd hungerhunt-kiosk && npx vitest run`
Expected: PASS (this file and any pre-existing vitest suites).

- [ ] **Step 5: Wire it into KioskBilling**

In `hungerhunt-kiosk/src/pages/KioskBilling.jsx`:

1. Import: `import { loadMenuSnapshot, saveMenuSnapshot } from "../utils/menuSnapshot";`
2. Seed the products state from the snapshot. Find the state declaration (search `const [products, setProducts] = useState`) and pass the loader as the lazy initializer:

```jsx
const [products, setProducts] = useState(loadMenuSnapshot);
```

3. Persist on every good refresh. In `applyInventory`, the success branch currently reads:

```jsx
    if (!error) {
      setProducts(next);
```

Change it to:

```jsx
    if (!error) {
      saveMenuSnapshot(next);
      setProducts(next);
```

Do not touch the error branch — a failed refresh must neither clear the snapshot nor the in-memory menu (that is the existing "last good catalogue" behaviour, now extended across restarts).

- [ ] **Step 6: Lint, test, build**

Run: `cd hungerhunt-kiosk && npm run lint && npx vitest run && npx vite build`
Expected: all clean.

- [ ] **Step 7: Manual smoke**

Run the kiosk dev server against the local backend, load the menu once, stop the backend, hard-reload the kiosk. Expected: the menu grid paints from the snapshot immediately (with the existing connection-error banner appearing for the failed refresh), instead of an empty screen.

- [ ] **Step 8: Commit**

```bash
git add hungerhunt-kiosk/src/utils/menuSnapshot.js hungerhunt-kiosk/src/utils/menuSnapshot.test.js hungerhunt-kiosk/src/pages/KioskBilling.jsx
git commit -m "Paint the last known menu at launch while the fresh one loads

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Preconnect hints in every app shell

**Files:**
- Modify: `hungerhunt-kiosk/index.html`
- Modify: `hungerhunt-warehouse/index.html`
- Modify: `frontend-admin/index.html`
- Modify: `frontend-parent/index.html`

**Interfaces:**
- Consumes: `VITE_API_BASE_URL` — the same build-time variable every app's `src/utils/api.js` already requires (release builds enforce it via `scripts/validate-frontend-release-env.mjs`). Vite substitutes `%VITE_API_BASE_URL%` in `index.html` natively.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add the hints to all four index.html files**

In each app's `index.html`, inside `<head>` after the `theme-color` meta tag, add:

```html
    <!-- Open the TLS connections the app will need before the JS asks for
         them. %VITE_API_BASE_URL% is substituted by Vite at build time; in a
         build without the variable it stays literal and the browser simply
         ignores an unparseable preconnect — harmless by design. -->
    <link rel="preconnect" href="%VITE_API_BASE_URL%" crossorigin />
    <link rel="preconnect" href="https://res.cloudinary.com" />
```

(The parent app does not currently render Cloudinary images; include the Cloudinary line anyway — it costs one idle connection and saves a divergent template. If the owner objects, dropping it from `frontend-parent` alone is fine.)

- [ ] **Step 2: Verify substitution in a build**

Run in one app (repeat spot-check in the others):

```bash
cd hungerhunt-warehouse && VITE_API_BASE_URL=https://preconnect-check.example npx vite build && grep -o 'preconnect-check.example' dist/index.html
```

Expected: the grep prints the substituted host, proving Vite replaced the placeholder. Then rebuild without the override (`npx vite build`) so no artifact with the fake host lingers.

- [ ] **Step 3: Confirm dev servers still boot**

Run `npm run dev` briefly in one app and load it. Expected: no console errors from the new link tags (a literal `%VITE_API_BASE_URL%` in dev, if the var is unset there, is ignored by the browser).

- [ ] **Step 4: Commit**

```bash
git add hungerhunt-kiosk/index.html hungerhunt-warehouse/index.html frontend-admin/index.html frontend-parent/index.html
git commit -m "Warm up the API and image connections before the first request needs them

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `cd backend && npm test` — full suite green.
- [ ] `cd hungerhunt-warehouse && npm run lint && npm run test && npx vite build` — green, chunked output.
- [ ] `cd hungerhunt-kiosk && npm run lint && npx vitest run && npx vite build` — green.
- [ ] `cd frontend-admin && npm run lint && npx vite build` — green.
- [ ] `cd frontend-parent && npm run lint && npx vite build` — green.
- [ ] `node scripts/check-shared-files.mjs` — all shared files in sync, including `cloudinaryThumb.js`.
- [ ] Remind the owner of the two manual follow-ups: set the `BACKEND_HEALTH_URL` Actions variable if the Render URL differs from `hungerhunt-dbat.onrender.com`, and remember the keep-warm schedule pauses after ~60 days of repo inactivity. Deploys remain manual (`render.yaml`: autoDeploy off) — the backend changes reach production only when the owner triggers a deploy, and the frontends when Vercel rebuilds.

## Deliberately out of scope

- Redis or any external cache — one Render instance, in-process is enough and free.
- Caching student responses, wallet reads, purchase codes, or package state — excluded by owner decision and by design (see readCache header comment).
- Admin console code splitting (already done) and kiosk code splitting (single screen).
- WebSockets/push to replace polling — different problem (update latency, not load time).
