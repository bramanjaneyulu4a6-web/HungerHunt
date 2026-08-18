# TallyPrime accounting export

The Admin console's **TallyPrime Export** page downloads native Tally XML for a
selected period. TallyPrime supports importing third-party vouchers from XML;
the file uses its `Vouchers` import envelope and accounting-voucher view.

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
- A request is limited to 93 days and 50,000 vouchers.
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
