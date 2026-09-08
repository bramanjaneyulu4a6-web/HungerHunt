import PDFDocument from 'pdfkit';

/* Renders one wallet recharge receipt, recreated from the office's paper
 * receipt: landscape, a rounded border, GRAARR SERVICES in orange over the
 * blue Kurnool address, a two-column field grid, one itemized line, and the
 * signature blocks. The title ("WALLET RECHARGE RECEIPT"), the red footer
 * line, and the grid's Student/Parent/Payment section headings differ from
 * the paper form, all by the owner's choice.
 *
 * Amounts print as "Rs." rather than the rupee sign because the PDF standard
 * fonts have no U+20B9 glyph — the template's own "Currency is in Rs." note
 * exists for the same reason. */

const ORANGE = '#F7941D';
const BLUE = '#1F3B9B';
const RED = '#D42B1E';
const INK = '#111111';
const RULE = '#333333';

const money = (n) => Number(n).toFixed(2);

/* How the money arrived, in words. `payment.upiLabel` is composed by
 * walletReceiptController — an app name for the checkouts where Hunger Hunt
 * owns the picker, a masked address for one the parent typed, and null when
 * the choice happened inside PhonePe's own screen and this server never saw
 * it. Nothing here re-derives it: the in-app receipt renders the same field,
 * and two copies of the rule is how the two views came to disagree before. */
export const paymentModeLine = (receipt) => {
  if (receipt.mode === 'CASH') return 'Cash — at school office';
  const label = receipt.payment?.upiLabel;
  return label ? `UPI (${label})` : 'UPI';
};

/* The itemized line. The order reference is what the office can actually look
 * a payment up by, so it wins; the app name is the consolation when a receipt
 * predates references, and naming nothing beats naming the wrong app. */
export const itemDescription = (receipt) => {
  if (receipt.mode === 'CASH') return 'Wallet Recharge (Cash)';
  const detail = receipt.payment?.merchantOrderId || receipt.payment?.upiLabel;
  return detail ? `Wallet Recharge (UPI — ${detail})` : 'Wallet Recharge (UPI)';
};

export const renderReceiptPdf = (receipt, stream) => {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
  doc.pipe(stream);

  const W = doc.page.width;   // 841.89
  const H = doc.page.height;  // 595.28
  const M = 36;               // inner content margin
  const contentW = W - M * 2;

  // The rounded frame the whole receipt sits in.
  doc.roundedRect(16, 16, W - 32, H - 32, 24).lineWidth(1.2).strokeColor(INK).stroke();

  // ── Letterhead ──────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(26).fillColor(ORANGE)
    .text(receipt.company.name, M, 40, { width: contentW, align: 'center' });

  doc.font('Helvetica-Bold').fontSize(13).fillColor(BLUE);
  for (const line of String(receipt.company.address || '').split('\n').filter(Boolean)) {
    doc.text(line, M, doc.y + 2, { width: contentW, align: 'center' });
  }

  const extras = [
    [receipt.company.cin && `CIN: ${receipt.company.cin}`, receipt.company.gstin && `GSTIN: ${receipt.company.gstin}`]
      .filter(Boolean).join('   '),
    [receipt.company.phone, receipt.company.email].filter(Boolean).join('   '),
  ].filter(Boolean);
  if (extras.length) {
    doc.font('Helvetica').fontSize(9).fillColor(BLUE);
    for (const line of extras) doc.text(line, M, doc.y + 2, { width: contentW, align: 'center' });
  }

  doc.moveDown(1.2);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
    .text('WALLET RECHARGE RECEIPT', M, doc.y, { width: contentW, align: 'center' });

  // Currency note left, copy mark right, on one line above the first rule.
  const noteY = doc.y + 12;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(RED)
    .text('Note :- Currency is in Rs.', M, noteY, { width: contentW / 2 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
    .text('Parent Copy', M + contentW / 2, noteY, { width: contentW / 2, align: 'right' });

  let y = noteY + 18;
  doc.moveTo(M, y).lineTo(W - M, y).lineWidth(1).strokeColor(RULE).stroke();

  // ── Field grid: two columns of "Label :  value" with underlines ────────
  const colW = contentW / 2;
  const labelW = 95;
  const gap = 18;

  const field = (label, value, x, yPos, width) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
      .text(`${label} :`, x, yPos, { width: labelW });
    doc.font('Helvetica').fontSize(10).fillColor(INK)
      .text(String(value ?? ''), x + labelW, yPos, {
        width: width - labelW - 10, lineBreak: false, ellipsis: true,
      });
    doc.moveTo(x + labelW, yPos + 13).lineTo(x + width - 10, yPos + 13)
      .lineWidth(0.5).strokeColor('#999999').stroke();
  };

  const date = new Date(receipt.date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const paymentMode = paymentModeLine(receipt);
  const rightDetail = receipt.mode === 'CASH'
    ? ['Received By', receipt.receivedBy?.name || '—']
    : ['PhonePe Ref', receipt.payment?.providerOrderId || receipt.payment?.merchantOrderId || '—'];

  y += 12;
  field('Receipt No.', receipt.receiptNumber, M, y, colW);
  field('Date', date, M + colW, y, colW);

  y += gap + 6;
  doc.moveTo(M, y - 4).lineTo(W - M, y - 4).lineWidth(1).strokeColor(RULE).stroke();
  y += 6;

  // Section headings in the letterhead's blue, so they read as structure
  // rather than as another field label.
  const heading = (label, yPos) => {
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(BLUE).text(label, M, yPos);
  };

  heading('Student Details', y);
  y += 16;
  field('Admission No.', receipt.student.admissionNumber, M, y, colW);
  field("Student's Name", receipt.student.name, M + colW, y, colW);
  y += gap;
  field('Class', receipt.student.className || '—', M, y, colW);
  field('Section', receipt.student.section || '—', M + colW, y, colW);
  y += gap;
  field('Room', receipt.student.roomNumber || '—', M, y, colW);

  y += gap + 4;
  heading('Parent Details', y);
  y += 16;
  field("Parent's Name", receipt.parent.name || '—', M, y, colW);
  field('Parent Contact', receipt.parent.phone || '—', M + colW, y, colW);

  y += gap + 4;
  heading('Payment Info', y);
  y += 16;
  field('Payment Mode', paymentMode, M, y, colW);
  field(rightDetail[0], rightDetail[1], M + colW, y, colW);

  /* The bank's reference, on its own row because it is the one identifier
     here a parent can also find on their own bank statement. Cash receipts
     have no rails to reference, and a UPI payment PhonePe never gave a UTR
     for prints nothing rather than an empty label. */
  if (receipt.mode === 'UPI' && receipt.payment?.utr) {
    y += gap;
    field('UTR', receipt.payment.utr, M, y, colW);
  }

  // ── The itemized table ─────────────────────────────────────────────────
  y += gap + 10;
  const tableX = M + 10;
  const tableW = contentW - 20;
  const snoW = 70;
  const amountW = 200;
  const descW = tableW - snoW - amountW;
  const headH = 22;
  const rowH = 26;

  doc.lineWidth(0.8).strokeColor(INK);
  doc.rect(tableX, y, tableW, headH + rowH).stroke();
  doc.moveTo(tableX, y + headH).lineTo(tableX + tableW, y + headH).stroke();
  doc.moveTo(tableX + snoW, y).lineTo(tableX + snoW, y + headH + rowH).stroke();
  doc.moveTo(tableX + snoW + descW, y).lineTo(tableX + snoW + descW, y + headH + rowH).stroke();

  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK);
  doc.text('S.No', tableX, y + 6, { width: snoW, align: 'center' });
  doc.text('Description', tableX + snoW + 10, y + 6, { width: descW - 20 });
  doc.text('Amount', tableX + snoW + descW, y + 6, { width: amountW, align: 'center' });

  const description = itemDescription(receipt);

  doc.font('Helvetica').fontSize(10);
  doc.text('1', tableX, y + headH + 8, { width: snoW, align: 'center' });
  doc.text(description, tableX + snoW + 10, y + headH + 8, { width: descW - 20, lineBreak: false, ellipsis: true });
  doc.text(money(receipt.amount), tableX + snoW + descW, y + headH + 8, { width: amountW - 14, align: 'right' });

  // ── Total and remarks ──────────────────────────────────────────────────
  y += headH + rowH + 14;
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK)
    .text('Total :', tableX, y, { width: 60, lineBreak: false });
  doc.text(`${money(receipt.amount)}  (${receipt.amountInWords})`, tableX + 60, y, {
    width: tableW - 60, lineBreak: false, ellipsis: true,
  });

  y += gap + 2;
  const remarks = [
    `Balance before Rs. ${money(receipt.previousBalance)}, after Rs. ${money(receipt.newBalance)}.`,
    receipt.mode === 'UPI' && receipt.payment?.merchantOrderId
      ? `Order Ref: ${receipt.payment.merchantOrderId}.`
      : '',
    receipt.note || '',
  ].filter(Boolean).join(' ');

  doc.font('Helvetica-Bold').fontSize(10).text('Remarks :', tableX, y, { width: 70, lineBreak: false });
  doc.font('Helvetica').fontSize(10)
    .text(remarks, tableX + 70, y, { width: tableW - 70, height: 26, ellipsis: true });
  doc.moveTo(tableX + 70, y + 13).lineTo(tableX + tableW, y + 13)
    .lineWidth(0.5).strokeColor('#999999').stroke();

  // ── Signatures and the footer line, anchored to the bottom ─────────────
  const signY = H - 88;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK);
  doc.text("Parent's Signature", M + 16, signY, { width: 200 });
  doc.text("Receiver's Signature", W - M - 216, signY, { width: 200, align: 'right' });

  doc.font('Helvetica-Bold').fontSize(9).fillColor(RED)
    .text('Wallet recharges are non-refundable and non-transferable', M, H - 48, {
      width: contentW, align: 'center',
    });

  // A digital copy carries its own provenance where the paper one has pen.
  doc.font('Helvetica').fontSize(7).fillColor('#777777')
    .text('Computer-generated receipt; valid without a signature.', M, H - 34, {
      width: contentW, align: 'center',
    });

  doc.end();
  return doc;
};
