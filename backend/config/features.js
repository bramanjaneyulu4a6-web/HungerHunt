// Feature flags. Read once at boot, after dotenv has populated process.env —
// app.js keeps 'dotenv/config' as its first import for exactly this reason.

// The Warehouse–Accounts v1 slice: the versioned purchase-order and analytics
// routes, the request-id middleware and the structured error envelope.
//
// This is now the production workflow, so it is on when unset. An operator can
// still use the exact value "false" as an emergency kill switch without a
// rebuild; any other value keeps the supported path available.
export const v1ProcurementEnabled = process.env.FEATURE_V1_PROCUREMENT !== 'false';
