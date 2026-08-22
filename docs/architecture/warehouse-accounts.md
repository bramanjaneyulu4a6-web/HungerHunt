# Warehouse and Accounts architecture

## Purpose and boundaries

The warehouse owns inventory counting, procurement requests, packing, receiving and delivery. The accounts application owns the financial approval or rejection of procurement requests. They communicate only through the versioned HTTP contract in [`openapi.yaml`](./openapi.yaml); neither application may read the other's database.

The current deployment is a modular monolith. That keeps transactions and operations simple while enforcing boundaries that can later be extracted into services without rewriting business rules.

```text
HTTP / JWT
    |
interfaces/http          routes, controllers, request/response mapping
    |
application              use cases, DTO validation, repository ports
    |
domain                   state machines, formulas, policies (no Express/Mongoose)
    ^
infrastructure           Mongoose repository adapters, transaction manager
```

Dependencies point inward. Domain code cannot import Express, Mongoose, database models, environment variables or an LLM SDK. Controllers do no business calculation. Repositories contain persistence details and implement the capabilities use cases need.

## Backend layout

```text
backend/
  src/
    domain/
      fulfillment/       customer-order state machine
      procurement/       purchase-order state machine
      analytics/         deterministic formulas and classifications
    application/
      procurement/
        dtos.js           request validation and response mapping
        useCases/         one class per application action
      analytics/          analytics orchestration
    infrastructure/
      persistence/mongoose/ repository adapters and unit of work
    interfaces/http/
      controllers/        HTTP-to-use-case adapters
      middleware/         async and request-context adapters
      routes/             versioned route tables
    shared/
      errors/             stable application error vocabulary
      observability/      structured JSON logger
  models/                 legacy Mongoose schemas during migration
  controllers/            legacy controllers during migration
  routes/                 legacy routes during migration
  tests/                  unit and contract-focused tests
```

The old directories intentionally remain. Existing clients still call `/api/purchases`; `/api/v1/purchase-orders` is the migration target. Once every client uses v1, legacy adapters and states can be retired with a data migration.

## Purchase-order state machine

```text
PENDING_REVIEW --approve--> APPROVED --partial receipt--> PARTIALLY_RECEIVED
       |                       |                              |
       +--reject--> REJECTED   +--------full receipt----------+--> RECEIVED
       |
       +--cancel--> CANCELLED  APPROVED/PARTIALLY_RECEIVED --cancel--> CANCELLED
```

`REJECTED`, `RECEIVED` and `CANCELLED` are terminal. Review uses a conditional database update whose filter includes `status: PENDING_REVIEW`; simultaneous decisions cannot both win. A losing request receives `409 STATE_CONFLICT`, including the current and expected status.

Fulfilment uses `PENDING → PACKED → OUT_FOR_DELIVERY → DELIVERED → COLLECTED`, with cancellation allowed before dispatch. Warehouse staff drive it as far as `DELIVERED`, naming the caretaker they handed the package to; `COLLECTED` is reached only by the student entering their own purchase code on the caretaker's screen, and no staff route can set it. State changes should always go through the domain policy, never arbitrary status assignments in controllers.

Caretakers also raise reports — a problem with one package, or a professional complaint about anything — through `POST /api/v1/caretaker/reports`, and read their own through `GET` on the same path. These are answered from the admin console only (`/api/v1/reports`, `protectAdmin`). A warehouse account cannot read them, deliberately: a complaint may be about the warehouse.

## Security and operations

- JWT authentication is already enforced by `protectWarehouse` and `protectAdmin`. The v1 request route permits `admin` and `warehouse`; only `admin` may approve or reject. Authentication (valid token) and authorization (role permission) stay separate.
- Every response includes an `x-request-id`; v1 envelopes repeat it in `meta.requestId`. Structured JSON completion and error logs carry the same ID. Logs intentionally omit authorization headers and request bodies.
- Multi-document changes should execute through `MongoUnitOfWork`. Mongo transactions require a replica set. External side effects should use an outbox written in the same transaction and delivered asynchronously.
- State-transition filters provide optimistic concurrency. `clientToken` remains the idempotency key for goods receipts. New externally retried commands should follow the same pattern.
- Errors have a stable machine code, safe message, optional field details and request ID. Unexpected error details are logged but not returned in production.

## Analytics and optimization engine

`GET /api/v1/analytics/inventory` returns pure JSON with `schemaVersion: 1.0`. The engine is deterministic: identical inputs and `asOf` produce identical output.

Inputs are product/inventory snapshots, transaction line usage and purchase-order history. Outputs include:

- 30/60/90-day units used and average daily usage; `HIGH_VELOCITY`, `NORMAL` and `DEAD_STOCK` classifications.
- Suggested safety stock, reorder point, days of cover and EOQ. Observed approval-to-receipt lead time takes precedence over configured supplier lead time, then a seven-day fallback.
- Approval/rejection ratios, review delay, supplier delay, total restock cycle and the slowest average stage.
- A cost-overrun flag when at least three recent orders exist and at least 60% are below half of calculated EOQ.

The formulas and thresholds are returned under `methodology`. This makes results explainable and suitable for dashboard cards. An optional LLM adapter can pass the complete `data` object as grounded context and ask for a summary, but the LLM must not calculate metrics, change stock, approve orders or trigger purchases. Store the analytics `schemaVersion`, prompt version and model identifier if generated narratives are audited.

Suggested values are advisory. Applying them should be a separate admin-only command with before/after audit records rather than a side effect of reading analytics.

## Scalability path

Start with indexed Mongo queries and periodically materialize daily product usage when transaction volume makes 90-day scans expensive. Cache analytics by `asOf` day and invalidate after stock or procurement writes. If procurement becomes a separate service, replace the Mongoose repository adapter with an HTTP/event adapter while retaining application and domain layers. Use an outbox and idempotent consumers rather than dual writes across databases.

