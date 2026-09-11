# TallyPrime accounting export

The Admin console's **TallyPrime Export** page offers the same movements in two
shapes, for two audiences:

- **`GET /accounting-exports/tally.xml`** — native Tally XML for a selected
  period, using Tally's `Vouchers` import envelope and accounting-voucher view.
  Machine-readable; nobody reads it, Tally does.
- **`GET /accounting-exports/tally.csv`** — the flat spreadsheet the office
  reconciles against the bank, in the column order of the school's own uniform
  receipts book. Carries student names, admission numbers, classes and receipt
  numbers, which the XML deliberately does not.

Both read the same rows over the same period and honour the same type
selection, so one can be reconciled against the other.

## Quick export and type filters

The page offers **Today** and **This week** (Sunday to today, in
`BUSINESS_TIME_ZONE`) alongside a custom period. The quick ranges are resolved
in the browser to the same `from`/`to` a custom range sends, so there is one
endpoint and one code path.

A shared set of checkboxes narrows every download on the page to a subset of
the five movement types, passed as `?include=`:

| Type | Collection | Selects |
|---|---|---|
| `CASH_DEPOSIT` | WalletAdjustment | `source` is not `PARENT_UPI` |
| `UPI_DEPOSIT` | WalletAdjustment | `source` is `PARENT_UPI` |
| `WALLET_DEDUCTION` | Transaction | `sourceType` is not `UPI_ORDER_PAYMENT` |
| `UPI_ORDER_PAYMENT` | Transaction | `sourceType` is `UPI_ORDER_PAYMENT` |
| `REFUND` | WalletReversal | all |

Omitting `include` means every type, which is what keeps older callers working.
A collection nothing was selected from is not queried at all. An unrecognised
type is a 400 rather than a silent narrowing: a typo that quietly halves a
month's export is discovered weeks later by an accountant who cannot balance
the books, while a 400 is discovered immediately.

Where a discriminating field is absent on a row written before that field
existed, the `$ne` filters above keep it on the same side of the split the
ledger screens already put it on (`utils/studentLedger.js`), rather than
dropping it out of both halves.

## CSV columns

`S.No`, `Receipt No`, `Admission No`, `Name`, `Class`, `Section`, `Amount`,
`Paid to`, `ModeOfPayment`, `Details`, `Date of Payment`, `Voucher Type`.

| Movement | Amount | ModeOfPayment | Voucher Type |
|---|---|---|---|
| Desk top-up | positive | `Cash` | Receipt |
| Parent UPI top-up | positive | `UPI` | Receipt |
| Wallet purchase | negative | `Wallet` | Sales |
| Order paid by UPI | positive | `UPI` | Sales |
| Cancellation refund | negative | `Refund` | Credit Note |

`Details` names the order for charges and refunds. `Receipt No` is blank on
wallet-deduction rows by design — `utils/walletReceipts.js` numbers only money
crossing the school's books, and a wallet-funded charge spends money receipted
on the way in. `Paid to` is a constant, overridable through `TALLY_PAID_TO`.

Failed top-up attempts never appear: the ledger records them because a parent
asks about them, but no money moved and a book listing non-events will not
reconcile to the bank.

The file is UTF-8 with a byte-order mark and CRLF records, so Excel opens it
without mangling the encoding.

## Accounting mapping

| HungerHunt event | Tally voucher | Debit | Credit |
|---|---|---|---|
| Wallet top-up | Receipt | Wallet Funding Clearing | Student Wallet Liability |
| Paid student order | Sales | Student Wallet Liability | HungerHunt Sales |
| Pre-dispatch cancellation refund | Credit Note | HungerHunt Sales | Student Wallet Liability |

This treats unused student wallet balances as a liability and recognizes sales
when a paid order is created. It does not assign tax treatment or claim to be a
statutory invoice. Accounts must confirm this mapping with the organization's
accountant before production import.

## Tally setup

Create these ledgers in the target company before importing, with groups and tax
treatment chosen by Accounts:

- `Student Wallet Liability`
- `HungerHunt Sales`
- `Wallet Funding Clearing`

The exact names and voucher types can be changed through the `TALLY_*`
environment variables documented in `backend/.env.example`.

In TallyPrime, use **Alt+O → Import → Transactions**, select XML, and choose the
downloaded file. Import into a backed-up test company first. Review the
Exceptions Report and `Tally.imp`; Tally requires the referenced masters to
exist and every voucher's debits and credits to balance.

## Safety and repeat imports

- Only a full Admin account can export.
- Date-only ranges use midnight in `BUSINESS_TIME_ZONE`; the through-date is
  inclusive.
- A request is limited to 93 days and 50,000 rows, for both formats.
- Voucher numbers are stable: `HH-S-<transaction id>` and
  `HH-R-<wallet-adjustment id>`; refunds use `HH-CN-<reversal id>`.
- The XML asks Tally to ignore duplicates. Operators should still keep import
  logs and avoid overlapping periods until repeat-import behavior is verified
  against the organization's exact TallyPrime release and company settings.
- Narration contains internal record references only. Student names, dorms,
  parent contacts, passwords, and tokens are excluded.
- Values with more than two decimal places fail the whole export rather than
  being silently rounded.

Official references:

- https://help.tallysolutions.com/import-data-in-tally/
- https://help.tallysolutions.com/sample-xml/
- https://help.tallysolutions.com/xml-integration/
