# Enterprise acceptance testing

Run these checks against a replica-set-backed staging deployment restored from
a recent production backup. Never point mutating load tests at production.

## Wallet reconciliation

The audit is read-only. It joins `Transactions` and `WalletAdjustments` in
chronological order, validates every balance movement, detects gaps, and checks
the final ledger balance against `Student.pocketMoney`.

```sh
cd backend
MONGO_URI='mongodb connection string' npm run audit:wallets -- --json
```

Exit code `0` means every wallet reconciled. Exit code `2` means the JSON report
contains discrepancies. Add `--include-names` only when the report will be kept
in an appropriately protected location.

## Read-only load tests

Start with readiness, then authenticated analytics. Thresholds are examples;
replace them with the agreed service-level objectives.

```sh
cd backend
npm run load:test -- \
  --url https://staging.example/health/ready \
  --requests 1000 --concurrency 25 --max-error-rate 0 --max-p95-ms 500

LOAD_TEST_TOKEN='staging admin token' npm run load:test -- \
  --url https://staging.example/api/v1/analytics/inventory \
  --requests 500 --concurrency 10 --max-error-rate 0 --max-p95-ms 1000
```

The harness reads a bearer token from `LOAD_TEST_TOKEN`, keeping it out of the
command line. For a staging-only checkout fixture, put its JSON request in
`LOAD_TEST_BODY`, select `--method POST`, and pass `--allow-mutation`. The safety
flag makes accidental writes less likely but does not make a production target
safe.

