# Enterprise hardening status

Updated: 2026-08-27

## Implemented and wired

- Parent approvals use an atomic `PENDING → PROCESSING → APPROVED` claim, a
  MongoDB transaction, a client idempotency key, one ledger transaction per
  approval, and the price snapshot displayed to the parent.
- Direct checkout commits purchase-authorisation consumption, inventory,
  wallet debit, spending-limit evaluation, and transaction ledger together.
- Admin wallet top-ups use an idempotent, append-only `WalletAdjustment`
  ledger and a transaction. The legacy embedded history is capped at 500 rows
  while the full audit trail remains queryable.
- Student removal is archival. It is blocked by a positive wallet balance or
  an active approval, preserves financial references, ends kiosk access, and
  has an authenticated restore endpoint.
- The v1 Warehouse–Accounts workflow is enabled by default. Warehouse creates
  `PENDING_REVIEW` requests; Accounts has an approve/reject queue; receiving is
  allowed only from approved states and advances to
  `PARTIALLY_RECEIVED`/`RECEIVED`.
- Deterministic analytics is visible in the Warehouse app. It emits stable,
  LLM-ready JSON for velocity, safety stock/reorder points, EOQ, procurement
  delays, and inefficient batching. Supplier lead time and product safety
  stock are editable in Admin.
- Runtime validation, database-before-listen startup, graceful shutdown,
  liveness/readiness probes, environment-driven CORS, business-timezone
  spending periods, bounded list reads, and query indexes are present.
- CI tests and lints the backend, builds all four clients, checks shared files,
  and lints all four clients with zero warnings.
- Admin's Users workspace has paginated Students, Parents, Staff and Archived
  tabs. It supports parent provisioning and one-time activation, parent and
  staff lifecycle management, linked-parent status, atomic spreadsheet import
  with exact invalid-cell reporting, and archived-student restoration.
- The student self-service kiosk is intentionally public at the device level:
  it has no staff login, device credential or enrollment flow. Admission number
  creates a short session; the student's four-digit purchase code remains the
  authorization required before checkout can move money.
- Admin pages and the shared layout are route-level lazy loaded. The spreadsheet
  parser is loaded only when a bulk student import is submitted; the production
  build now keeps the initial JavaScript chunk at about 249 KB before gzip and
  loads page-specific code separately.
- A read-only wallet reconciliation command validates ledger arithmetic,
  continuity, orphaned entries, and the final `Student.pocketMoney` projection.
  A dependency-free HTTP load harness reports throughput and latency percentiles
  and enforces configurable error-rate and p95 thresholds. Usage is documented
  in `docs/architecture/acceptance-testing.md`.
- The integer-paise migration foundation includes strict, tested conversion,
  validation, and summation helpers. Compatibility fields and dual writes are
  the next migration slice and must land together.
- Paid kiosk checkout now creates a transaction-linked dorm package inside the
  same MongoDB transaction. A unique student/business-week index enforces one
  paid order per week, every order carries a 48-hour delivery deadline, and the
  Warehouse app can record packing, dispatch, and delivery with staff audit
  history. Parents can track package state and the stored deadline; Warehouse
  has snoozed, auditable overdue alerts plus bounded history and aggregate
  delivery reports. Delivery records the caretaker's name and callback number
  in a dedicated warehouse handoff form, tied to the authenticated staff
  account and server time. The parent view does not expose that phone number.
  A package is finished only when the
  student takes it: `COLLECTED` is reached by that student entering their own
  purchase code on the caretaker's screen, checked against the same miss
  counter and lock as checkout, and no staff route can set it. Pre-dispatch
  cancellation is backed by the reversal ledger described below.
- Caretakers can raise a package issue from the handover screen and a
  professional complaint about anything from their app's reports screen, and
  read the office's answer to both. Reporting never holds a package. The queue
  is answered from the admin console alone — a complaint may be about the
  warehouse, so no warehouse or caretaker account can read one. Every admin
  sees the same queue with no owner or assignment, so each answer records the
  admin who wrote it and shows that name to the caretaker, and an
  undismissable banner counts unanswered reports on every console screen.
- Admin can download a bounded, privacy-minimized TallyPrime XML voucher export.
  Wallet top-ups and paid orders become balanced Receipt/Sales vouchers with
  stable source-derived numbers, exact money validation, business-timezone
  dates, configurable ledger names, and duplicate-ignore import guidance.
- Warehouse can generate a seven-day editable replenishment draft from the
  deterministic analytics report. Draft quantities subtract coverage on open
  purchase orders, duplicate active drafts are blocked, and submission enters
  the existing `PENDING_REVIEW` Accounts queue.
- Paid dorm packages can be cancelled before dispatch with a required reason
  and idempotency key. The Mongo transaction appends a `WalletReversal`, restores
  wallet and inventory, cancels the package, releases its weekly slot, and
  preserves the original sale. Parents see the refund and Tally receives a
  Credit Note. Spending-limit calculations net reversals from gross purchases.
- Parents can pay by UPI through PhonePe Standard Checkout v2, restricted to
  UPI-only payment modes so the merchant fee stays at 0%. A `PaymentIntent`
  row tracks every attempt from `CREATED` through `APPLIED` (or out to
  `FAILED`/`EXPIRED`/`AMOUNT_MISMATCH`), and only `settlePaymentIntent` ever
  moves money — it re-reads status from PhonePe's server API on every call,
  never trusting a webhook body or a client's say-so. A UPI order payment
  bypasses the wallet entirely; a top-up credits it through the same
  `WalletAdjustment` ledger admin top-ups use. A captured payment whose order
  can no longer be bought is credited to the wallet instead
  (`degradedToTopup`) rather than left stranded, because v1 has no refund
  API. `npm run reconcile:payments` sweeps unfinished intents and is the net
  under a dropped webhook. See `docs/architecture/product-decisions.md`
  section 6 for the reasoning, including why the wallet's closed-loop design
  (no cash-out) is not incidental.

### Deliberately absent

- **No refund API.** A captured payment that cannot buy its order becomes a
  wallet credit, not a reversal to the parent's bank account. There is no
  code path, planned or partial, that sends money back out over UPI.
- **No admin-facing payments screen.** `PaymentIntent` rows — including the
  `AMOUNT_MISMATCH` backlog — are visible only by querying the database or
  reading the reconcile sweep's output. Nothing in the Admin app lists or
  searches them yet.
- **iOS is configured but untested on real hardware**, the same status
  `RELEASE-CHECKLIST.md` already records for native push: the UPI intent
  schemes (`phonepe`, `gpay`, `paytm`, `bhim`, `tez`, `upi`) are declared in
  `frontend-parent/ios/App/App/Info.plist` so the checkout page can hand off
  to an installed UPI app, but that hand-off has only run on Android. It has
  never been built and run on a physical iPhone, and the iOS Simulator cannot
  install a UPI app to test against in the first place.
- **Two route-registration lines are deliberately uncommitted** in the
  working tree: the `paymentRoutes` import and `app.use('/api/payments',
  paymentRoutes)` in `backend/app.js`, and the `/payment-return` route in
  `frontend-parent/src/App.jsx`. Both files are mid-refactor for unrelated
  work (the admin activation flow and the `/api/v1` mount restructuring), so
  wiring the payment routes into them was left for that refactor to land
  first rather than committed underneath it. Until those two lines are
  committed, `POST /api/payments/intents` and its siblings exist in the
  repository but nothing serves them, and PhonePe's checkout would have
  nowhere to redirect back to.
- **Not live.** The feature is sandbox-ready, not production-ready: going
  live needs PhonePe Business production credentials, the production webhook
  URL registered on the PhonePe dashboard, `PHONEPE_ENV=production` set, and
  one real ₹1 transaction completed end to end before it is announced to
  parents.

## Required deployment actions

1. Use MongoDB Atlas or another replica-set/sharded deployment. Standalone
   MongoDB cannot provide the transaction guarantees now required.
2. Back up the database, deploy the code, then run `npm run
   migrate:enterprise` once from `backend/`. The migration verifies transaction
   support, backfills new defaults, replaces the active pending-order index,
   and creates the new indexes.
3. Set all production values documented in `backend/.env.example`, especially
   three different 32+ character JWT secrets, `BUSINESS_TIME_ZONE`, deployed
   client URLs, Cloudinary, Firebase, and SMTP credentials.
4. Rotate any credential that has ever appeared in source control or logs.
   Code cannot revoke an already issued secret.
5. Confirm the deployment health check uses `/health/ready`; `/health/live`
   intentionally does not test MongoDB.
6. Leave `FEATURE_V1_PROCUREMENT` unset or `true`. `false` is an emergency kill
   switch for purchase-order review, procurement analytics, and replenishment
   drafts. Fulfilment, caretaker operations, reports, and exports stay online.
7. Schedule `npm run reconcile:payments` on a cron (Render cron job or
   equivalent), not just run it by hand. The webhook and the parent's own
   status poll cover the common case, but a dropped webhook is only ever
   recovered by this sweep or by a parent happening to reopen the payment
   screen — without a schedule, a stuck `PaymentIntent` can sit unresolved
   indefinitely.

## Product decisions recorded; implementation remains staged

- **Customer fulfilment:** each successful student order becomes a package for
  the student's dorm, due within 48 hours of payment, with at most one successful
  order per student per business week. It uses a separate, transaction-linked
  `FulfillmentOrder`; parent tracking, packing, dispatch, proof of delivery,
  overdue acknowledgement, operational reporting, cancellation and refund are
  implemented.
- **External accounting:** the first versioned export targets TallyPrime native
  XML bulk voucher import. Accounts still needs to confirm ledger groups and tax
  treatment and validate an import against its exact Tally company configuration.
- **Automatic replenishment:** analytics may create editable, expiring drafts
  with open-order deduplication. Warehouse must submit and Accounts must approve;
  the system never purchases autonomously. This draft workflow is implemented.
- **LLM narrative adapter:** deferred and disabled. Deterministic analytics is
  the supported experience; a future adapter must use aggregated, redacted data
  and remain read-only.
- **Money representation migration:** integer paise is the target. Migration
  will use dual-written compatibility fields, audited backfill, versioned API
  cutover, reconciliation, and a separate later removal of rupee fields.

The full rationale, guardrails, and implementation order are recorded in
`docs/architecture/product-decisions.md`.
- **Production integrations:** centralized log/search provider, metrics and
  alerting destination, error tracking, backup/restore drills, and load-test
  targets need the actual hosting stack and service-level objectives.

## Recommended acceptance tests before go-live

- Run two concurrent approvals and two concurrent top-ups against a staging
  replica set and verify one financial movement per idempotency key.
- Exercise Warehouse request → Accounts approval/rejection → partial/full
  receipt using real browser builds and roles.
- Reconcile Student balances against Transactions and WalletAdjustments after
  a restored production backup.
- Load-test checkout and analytics using production-like transaction volume,
  and verify alerts on readiness failure, transaction aborts, and push-outbox
  backlog.
