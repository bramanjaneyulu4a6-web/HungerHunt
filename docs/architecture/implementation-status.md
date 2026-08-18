# Enterprise hardening status

Updated: 2026-08-13

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
- CI tests the backend, builds all four clients, checks shared files, and lints
  all four clients with zero warnings.
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
  delivery reports. Delivery requires a privacy-minimized receiver note tied to
  the authenticated staff account and server time. Pre-dispatch cancellation
  is backed by the reversal ledger described below.
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
   switch and temporarily hides review-workflow orders from the clients.

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
