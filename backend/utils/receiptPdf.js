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
  // Money going back does not have a payment mode; it has a destination, and
  // there is only one — the wallet it was taken from.
  if (receipt.kind === 'REFUND') return "Student's wallet";
  if (receipt.mode === 'CASH') return 'Cash — at school office';
  const label = receipt.payment?.upiLabel;
  return label ? `UPI (${label})` : 'UPI';
};

/* The itemized line. The order reference is what the office can actually look
 * a payment up by, so it wins; the app name is the consolation when a receipt
 * predates references, and naming nothing beats naming the wrong app. */
export const itemDescription = (receipt) => {
  if (receipt.kind === 'REFUND') {
    const order = receipt.refund?.orderReference;
    return order ? `Refund — Cancelled Order ${order}` : 'Refund — Cancelled Order';
  }
  if (receipt.kind === 'ORDER_PAYMENT') {
    const order = receipt.order?.orderReference;
    return order ? `Order ${order}` : 'Order';
  }
  if (receipt.mode === 'CASH') return 'Wallet Recharge (Cash)';
  const detail = receipt.payment?.merchantOrderId || receipt.payment?.upiLabel;
  return detail ? `Wallet Recharge (UPI — ${detail})` : 'Wallet Recharge (UPI)';
};

/* The receipt is drawn in the space it was designed for — a full A4 landscape
 * page — and then set into the top half of a portrait A4 sheet.
 *
 * That costs one scale factor and nothing else. Half a portrait A4 is an A5
 * landscape, which is the same rectangle as A4 landscape at 1/√2, so the whole
 * design drops in untouched: no field reflows, no letterhead is rebuilt, and
 * the bottom half of the paper is left blank for the office to tear or fold
 * along. Every coordinate below this transform is still in the landscape
 * space, which is why the two figures are constants here rather than read off
 * doc.page — that now reports the portrait sheet the receipt sits on.
 */
/* An order's basket as table lines. The receipt lists them in its own
 * table when they fit the half sheet; when they do not, it prints one
 * summary line and the whole basket goes on the rest of the paper, so no
 * item is ever left off. */
export const orderLines = (items) =>
  (items || []).map((item, index) => ({
    cells: [
      String(index + 1),
      item.name,
      String(item.quantity),
      money(item.price),
      money(item.quantity * item.price),
    ],
  }));

const orderColumns = (width) => [
  { label: 'S.No', width: 70, align: 'center' },
  { label: 'Description', width: width - 70 - 60 - 100 - 130, align: 'left' },
  { label: 'Qty', width: 60, align: 'center' },
  { label: 'Rate', width: 100, align: 'right' },
  { label: 'Amount', width: 130, align: 'right' },
];

/* One ruled table: a header row, then body rows. Returns its height.
 * `headAlign` lets a header sit differently from its figures, as the paper
 * form centres "Amount" over right-aligned numbers. */
const drawTable = (doc, { x, y, columns, rows, headH = 22, rowH, bodyFont = 10 }) => {
  const width = columns.reduce((sum, column) => sum + column.width, 0);
  const bodyH = Math.max(1, rows.length) * rowH;

  doc.lineWidth(0.8).strokeColor(INK);
  doc.rect(x, y, width, headH + bodyH).stroke();
  doc.moveTo(x, y + headH).lineTo(x + width, y + headH).stroke();
  let edge = x;
  for (const column of columns.slice(0, -1)) {
    edge += column.width;
    doc.moveTo(edge, y).lineTo(edge, y + headH + bodyH).stroke();
  }

  const cell = (text, left, column, top, align) => {
    const pad = align === 'center' ? 0 : 10;
    doc.text(text ?? '', left + pad, top, {
      width: column.width - pad * 2,
      align,
      lineBreak: false,
      ellipsis: true,
    });
  };

  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK);
  let left = x;
  for (const column of columns) {
    cell(column.label, left, column, y + 6, column.headAlign || column.align);
    left += column.width;
  }

  doc.font('Helvetica').fontSize(bodyFont);
  const inset = (rowH - bodyFont) / 2;
  rows.forEach((row, index) => {
    let cellLeft = x;
    columns.forEach((column, columnIndex) => {
      cell(row.cells[columnIndex], cellLeft, column, y + headH + inset + index * rowH, column.align);
      cellLeft += column.width;
    });
  });

  return headH + bodyH;
};

/* The rest of the paper, for a basket too long for the receipt's own table:
 * the bottom half of the sheet first, then as many further sheets as it
 * takes, a half at a time. Every half carries the receipt number, so a torn
 * or loose piece still says which receipt it belongs to.
 *
 * Each half is drawn in its own coordinates and moved into place, rather
 * than drawn at y > 841: PDFKit decides when to start a new page by an
 * untransformed y, and text past the bottom of an A4 page — in its units,
 * not ours — would start pages of its own. */
const drawBasketContinuation = (doc, receipt, { M, contentW, H }) => {
  const lines = orderLines(receipt.order?.items);
  const columns = orderColumns(contentW - 20);
  const rowH = 16;
  const headH = 22;
  const top = 30;
  const room = Math.floor((H - top - 22 - headH - 30) / rowH);
  const order = receipt.order?.orderReference;

  let remaining = lines;
  let half = 1; // 0: top half, 1: bottom half. Page one's top is the receipt.
  while (remaining.length) {
    if (half === 2) {
      doc.addPage({ size: 'A4', margin: 0 });
      doc.scale(halfSheetScale(doc.page.width));
      half = 0;
    }
    const chunk = remaining.slice(0, room);
    remaining = remaining.slice(room);

    doc.save();
    doc.translate(0, half * H);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BLUE)
      .text(
        `Items in ${order ? `order ${order}` : 'this order'} — receipt ${receipt.receiptNumber}`,
        M + 10,
        top,
        { width: contentW - 20, lineBreak: false }
      );
    drawTable(doc, { x: M + 10, y: top + 22, columns, rows: chunk, headH, rowH, bodyFont: 9.5 });
    doc.restore();
    half += 1;
  }
};

const TITLES = {
  RECHARGE: 'WALLET RECHARGE RECEIPT',
  REFUND: 'WALLET REFUND RECEIPT',
  ORDER_PAYMENT: 'ORDER PAYMENT RECEIPT',
};

const FOOTERS = {
  RECHARGE: 'Wallet recharges are non-refundable and non-transferable',
  REFUND: 'Refunded to the student wallet; not payable in cash or transferable',
  ORDER_PAYMENT: 'A cancelled order is refunded to the student wallet, not in cash',
};

export const RECEIPT_SPACE = { width: 841.89, height: 595.28 };

/* Exported to be checked as arithmetic rather than by reading a PDF: at A4
 * the factor is 1/√2, and it must leave the receipt exactly half a page tall
 * — a factor that merely fits would let the design drift off the fold. */
export const halfSheetScale = (pageWidth) => pageWidth / RECEIPT_SPACE.width;

export const renderReceiptPdf = (receipt, stream) => {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.pipe(stream);

  // Applied before anything is drawn, so it governs every mark on the page.
  doc.scale(halfSheetScale(doc.page.width));

  const W = RECEIPT_SPACE.width;   // 841.89
  const H = RECEIPT_SPACE.height;  // 595.28
  const M = 36;                    // inner content margin
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

  const isRefund = receipt.kind === 'REFUND';
  const isOrder = receipt.kind === 'ORDER_PAYMENT';

  doc.moveDown(1.2);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
    .text(TITLES[receipt.kind] || TITLES.RECHARGE, M, doc.y, {
      width: contentW,
      align: 'center',
    });

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
  const rightDetail = receipt.kind === 'REFUND'
    ? ['Refunded By', receipt.receivedBy?.name || '—']
    : receipt.mode === 'CASH'
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
  if (isOrder) {
    // One line fewer than the other receipts: the basket needs the room.
    const classLine = [receipt.student.className, receipt.student.section].filter(Boolean).join(' - ');
    field('Class', classLine || '—', M, y, colW);
    field('Room', receipt.student.roomNumber || '—', M + colW, y, colW);
  } else {
    field('Class', receipt.student.className || '—', M, y, colW);
    field('Section', receipt.student.section || '—', M + colW, y, colW);
    y += gap;
    field('Room', receipt.student.roomNumber || '—', M, y, colW);
  }

  y += gap + 4;
  heading('Parent Details', y);
  y += 16;
  field("Parent's Name", receipt.parent.name || '—', M, y, colW);
  field('Parent Contact', receipt.parent.phone || '—', M + colW, y, colW);

  y += gap + 4;
  heading(isRefund ? 'Refund Info' : 'Payment Info', y);
  y += 16;
  field(isRefund ? 'Refunded To' : 'Payment Mode', paymentMode, M, y, colW);
  field(rightDetail[0], rightDetail[1], M + colW, y, colW);

  /* What was refunded and why. The order is the handle the storeroom, the
     family and this document all share; the reason is the note whoever
     cancelled it left, which is the whole point of the piece of paper. */
  if (isRefund) {
    y += gap;
    field('Order', receipt.refund?.orderReference || '—', M, y, colW);
    field('Reason', receipt.refund?.reason || '—', M + colW, y, colW);
  }

  /* The bank's reference, on its own row because it is the one identifier
     here a parent can also find on their own bank statement. Cash receipts
     have no rails to reference, and a UPI payment PhonePe never gave a UTR
     for prints nothing rather than an empty label. */
  /* An order payment shares one row between the package and the bank's
     reference: the half sheet needs every line it can spare for the basket. */
  if (isOrder) {
    y += gap;
    field('Order', receipt.order?.orderReference || '—', M, y, colW);
    if (receipt.payment?.utr) field('UTR', receipt.payment.utr, M + colW, y, colW);
  } else if (receipt.mode === 'UPI' && receipt.payment?.utr) {
    y += gap;
    field('UTR', receipt.payment.utr, M, y, colW);
  }

  /* A refund's UTR is the one the money came in on. Labelled as the original
     payment's, because it is: nothing left the school through the gateway,
     and a parent looking this up at their bank will find the payment, not
     the refund. Absent for an order paid out of the wallet, which was funded
     by earlier deposits with UTRs of their own. */
  if (isRefund && receipt.refund?.originalUtr) {
    y += gap;
    field('Original UTR', receipt.refund.originalUtr, M, y, colW);
  }

  // ── The itemized table ─────────────────────────────────────────────────
  y += isOrder ? gap : gap + 10;
  const tableX = M + 10;
  const tableW = contentW - 20;
  const signY = H - 88;
  const headH = 22;

  /* Everything between the table and the signatures is a fixed height —
     total, remarks and a little air — so an order's rows get what is left. */
  const belowTable = 14 + gap + 2 + 13 + 12;
  const basket = isOrder ? orderLines(receipt.order?.items) : [];
  const orderRowH = 15;
  const fits = basket.length <= Math.floor((signY - belowTable - y - headH) / orderRowH);
  const listedBelow = isOrder && !fits;

  let tableH;
  if (isOrder) {
    const order = receipt.order?.orderReference;
    const count = basket.length;
    const rows = listedBelow
      ? [{
          cells: [
            '1',
            `${order ? `Order ${order}` : 'Order'} — ${count} items, listed below`,
            '',
            '',
            money(receipt.amount),
          ],
        }]
      : basket;
    tableH = drawTable(doc, {
      x: tableX, y, columns: orderColumns(tableW), rows, headH, rowH: orderRowH, bodyFont: 9.5,
    });
  } else {
    tableH = drawTable(doc, {
      x: tableX,
      y,
      columns: [
        { label: 'S.No', width: 70, align: 'center' },
        { label: 'Description', width: tableW - 270, align: 'left' },
        { label: 'Amount', width: 200, align: 'right', headAlign: 'center' },
      ],
      rows: [{ cells: ['1', itemDescription(receipt), money(receipt.amount)] }],
      headH,
      rowH: 26,
    });
  }

  // ── Total and remarks ──────────────────────────────────────────────────
  y += tableH + 14;
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK)
    .text('Total :', tableX, y, { width: 60, lineBreak: false });
  doc.text(`${money(receipt.amount)}  (${receipt.amountInWords})`, tableX + 60, y, {
    width: tableW - 60, lineBreak: false, ellipsis: true,
  });

  y += gap + 2;
  const remarks = [
    // An order paid by UPI never touched the wallet, so its balance is not
    // news; saying so is.
    isOrder
      ? 'Paid directly by UPI; the student wallet was not charged.'
      : `Balance before Rs. ${money(receipt.previousBalance)}, after Rs. ${money(receipt.newBalance)}.`,
    receipt.mode === 'UPI' && receipt.payment?.merchantOrderId
      ? `Order Ref: ${receipt.payment.merchantOrderId}.`
      : '',
    isRefund && receipt.refund?.originalOrderRef
      ? `Original payment ref: ${receipt.refund.originalOrderRef}.`
      : '',
    receipt.note || '',
  ].filter(Boolean).join(' ');

  doc.font('Helvetica-Bold').fontSize(10).text('Remarks :', tableX, y, { width: 70, lineBreak: false });
  doc.font('Helvetica').fontSize(10)
    .text(remarks, tableX + 70, y, { width: tableW - 70, height: 26, ellipsis: true });
  doc.moveTo(tableX + 70, y + 13).lineTo(tableX + tableW, y + 13)
    .lineWidth(0.5).strokeColor('#999999').stroke();

  // ── Signatures and the footer line, anchored to the bottom ─────────────
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK);
  doc.text("Parent's Signature", M + 16, signY, { width: 200 });
  // A refund is signed off by the school, not receipted by it.
  doc.text(isRefund ? 'Authorised Signature' : "Receiver's Signature", W - M - 216, signY, {
    width: 200,
    align: 'right',
  });

  doc.font('Helvetica-Bold').fontSize(9).fillColor(RED)
    .text(
      FOOTERS[receipt.kind] || FOOTERS.RECHARGE,
      M,
      H - 48,
      { width: contentW, align: 'center' }
    );

  // A digital copy carries its own provenance where the paper one has pen.
  doc.font('Helvetica').fontSize(7).fillColor('#777777')
    .text('Computer-generated receipt; valid without a signature.', M, H - 34, {
      width: contentW, align: 'center',
    });

  if (listedBelow) drawBasketContinuation(doc, receipt, { M, contentW, H });

  doc.end();
  return doc;
};
