import { rupeesToPaise } from '../../../utils/money.js';

const xmlEscape = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const tallyDate = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
};

const tallyAmount = (paise, debit = false) => {
  const absolute = Math.abs(paise);
  const value = `${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
  return debit ? `-${value}` : value;
};

const ledgerEntry = ({ name, paise, debit }) => `
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${xmlEscape(name)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
            <ISPARTYLEDGER>No</ISPARTYLEDGER>
            <AMOUNT>${tallyAmount(paise, debit)}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>`;

const voucher = ({ type, number, date, narration, debitLedger, creditLedger, paise, timeZone }) => `
      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="${xmlEscape(type)}" ACTION="Create" OBJVIEW="Accounting Voucher View">
          <DATE>${tallyDate(date, timeZone)}</DATE>
          <VOUCHERTYPENAME>${xmlEscape(type)}</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${xmlEscape(number)}</VOUCHERNUMBER>
          <REFERENCE>${xmlEscape(number)}</REFERENCE>
          <NARRATION>${xmlEscape(narration)}</NARRATION>
          <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
          <ISINVOICE>No</ISINVOICE>${ledgerEntry({ name: debitLedger, paise, debit: true })}${ledgerEntry({ name: creditLedger, paise, debit: false })}
        </VOUCHER>
      </TALLYMESSAGE>`;

export const buildTallyVoucherXml = ({ transactions, adjustments, reversals = [], ledgers, timeZone }) => {
  const entries = [
    ...transactions.map((row) => ({
      kind: 'SALE', id: String(row._id), studentId: String(row.studentId),
      date: new Date(row.createdAt), paise: rupeesToPaise(row.totalAmount),
    })),
    ...adjustments.map((row) => ({
      kind: 'TOP_UP', id: String(row._id), studentId: String(row.studentId),
      date: new Date(row.createdAt), paise: rupeesToPaise(row.amount),
    })),
    ...reversals.map((row) => ({
      kind: 'REVERSAL', id: String(row._id), studentId: String(row.studentId),
      date: new Date(row.createdAt), paise: rupeesToPaise(row.amount),
    })),
  ].sort((left, right) => left.date - right.date || left.id.localeCompare(right.id));

  const vouchers = entries.map((entry) => {
    if (entry.kind === 'SALE') return voucher({
        type: ledgers.salesVoucherType, number: `HH-S-${entry.id}`, date: entry.date,
        narration: `HungerHunt sale ${entry.id}; student ref ${entry.studentId}`,
        debitLedger: ledgers.walletLiability, creditLedger: ledgers.sales,
        paise: entry.paise, timeZone,
      });
    if (entry.kind === 'REVERSAL') return voucher({
      type: ledgers.refundVoucherType, number: `HH-CN-${entry.id}`, date: entry.date,
      narration: `HungerHunt order cancellation ${entry.id}; student ref ${entry.studentId}`,
      debitLedger: ledgers.sales, creditLedger: ledgers.walletLiability,
      paise: entry.paise, timeZone,
    });
    return voucher({
        type: ledgers.receiptVoucherType, number: `HH-R-${entry.id}`, date: entry.date,
        narration: `HungerHunt wallet top-up ${entry.id}; student ref ${entry.studentId}`,
        debitLedger: ledgers.fundingClearing, creditLedger: ledgers.walletLiability,
        paise: entry.paise, timeZone,
      });
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
  <BODY>
    <DESC><STATICVARIABLES><IMPORTDUPS>@@DUPIGNORE</IMPORTDUPS></STATICVARIABLES></DESC>
    <DATA>${vouchers.join('')}
    </DATA>
  </BODY>
</ENVELOPE>
`;
};
