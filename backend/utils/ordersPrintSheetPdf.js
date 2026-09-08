import PDFDocument from 'pdfkit';

/* Draws the orders list buildPrintSheet assembled: the active-orders board on
 * A4, one entry per caretaker unit, with a Packed and an Out-for-delivery
 * checkbox beside each entry for the pen. Stages the unit has already passed
 * arrive pre-ticked.
 *
 * Every stage begins on its own page, so the storeroom can hand "Packed" to
 * one person and "Out for delivery" to another without scissors. Within a
 * stage, blocks carry a shaded banner and each unit lists its items one per
 * line — this sheet is read on a trolley at arm's length, so space beats
 * density everywhere the two compete.
 *
 * Deliberately monochrome and plain — it prints on the storeroom's
 * black-and-white printer. */

const INK = '#111111';
const FAINT = '#555555';
const RULE = '#bbbbbb';
const BAND = '#e8e8e8';

export const renderOrdersPrintSheet = (sheet, stream) => {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  doc.pipe(stream);

  const W = doc.page.width; // 595.28
  const H = doc.page.height; // 841.89
  const M = 42;
  const bottom = H - M;
  const contentW = W - M * 2;

  const TEXT_W = 320; // rooms + items column
  const PACKED_CX = M + 395; // centers of the two checkbox columns
  const OFD_CX = M + 475;
  const BOX = 15;

  let y = M;

  const columnHeaders = () => {
    doc.font('Helvetica-Bold').fontSize(7).fillColor(FAINT);
    doc.text('PACKED', PACKED_CX - 35, y, { width: 70, align: 'center' });
    doc.text('OUT FOR DELIVERY', OFD_CX - 35, y, { width: 70, align: 'center' });
    y += 14;
  };

  // Entries must not straddle a page edge; a checkbox split in half is unusable.
  const ensureRoom = (height, { redrawColumns = false } = {}) => {
    if (y + height <= bottom) return;
    doc.addPage();
    y = M;
    if (redrawColumns) columnHeaders();
  };

  const checkbox = (cx, top, checked) => {
    const x = cx - BOX / 2;
    doc.rect(x, top, BOX, BOX).lineWidth(1).strokeColor(INK).stroke();
    if (checked) {
      doc
        .moveTo(x + 3, top + 8)
        .lineTo(x + 6.5, top + 11.5)
        .lineTo(x + 12, top + 3.5)
        .lineWidth(1.5)
        .stroke();
    }
  };

  const countLine = (unitCount, itemCount) =>
    `${unitCount} unit${unitCount === 1 ? '' : 's'} · ${itemCount} item${itemCount === 1 ? '' : 's'}`;

  /* One item per line reads clearly but eats height, so a long list folds
     into two columns; a unit's items always stay on one page either way. */
  const ITEM_LINE = 13;
  const itemColumns = (items) =>
    items.length > 8
      ? [items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))]
      : [items];

  const drawItems = (items, top) => {
    const columns = itemColumns(items);
    const colW = columns.length === 1 ? TEXT_W - 12 : (TEXT_W - 24) / 2;
    columns.forEach((column, columnIndex) => {
      const x = M + 12 + columnIndex * (colW + 12);
      column.forEach((item, index) => {
        const lineY = top + index * ITEM_LINE;
        doc.font('Helvetica').fontSize(9).fillColor(INK)
          .text(item.name, x, lineY, { width: colW - 34, lineBreak: false, ellipsis: true });
        doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
          .text(`×${item.quantity}`, x + colW - 30, lineY, { width: 30, align: 'right' });
      });
    });
    return Math.max(...columns.map((column) => column.length)) * ITEM_LINE;
  };

  // ── Sheet header ─────────────────────────────────────────────────────────
  const timeZone = process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata';
  const stamp = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(sheet.generatedAt);

  doc.font('Helvetica-Bold').fontSize(18).fillColor(INK)
    .text('Hunger Hunt — Orders list', M, y);
  y = doc.y + 6;
  doc.font('Helvetica').fontSize(9.5).fillColor(FAINT).text(
    `Printed ${stamp} · ${countLine(sheet.totals.unitCount, sheet.totals.itemCount)} across ` +
      `${sheet.totals.orderCount} order${sheet.totals.orderCount === 1 ? '' : 's'}. ` +
      'Tick each box as the work happens; pre-ticked boxes were already done when this was printed.',
    M,
    y,
    { width: contentW, lineGap: 2 }
  );
  y = doc.y + 8;
  doc.font('Helvetica').fontSize(9.5).fillColor(FAINT).text(
    `Stages on this sheet: ${sheet.sections.map((section) => section.label).join(' · ')}. Each stage starts on its own page.`,
    M,
    y,
    { width: contentW }
  );
  y = doc.y + 16;

  // ── Sections — every stage begins a fresh page ───────────────────────────
  sheet.sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) {
      doc.addPage();
      y = M;
    }

    doc.moveTo(M, y).lineTo(W - M, y).lineWidth(1.2).strokeColor(INK).stroke();
    y += 12;
    doc.font('Helvetica-Bold').fontSize(15).fillColor(INK).text(section.label, M, y);
    doc.font('Helvetica').fontSize(9.5).fillColor(FAINT).text(
      countLine(section.unitCount, section.itemCount),
      M,
      y + 4,
      { width: contentW, align: 'right' }
    );
    y += 26;

    if (!section.blocks.length) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(FAINT)
        .text('Nothing at this stage.', M, y);
      y += 26;
      return;
    }

    columnHeaders();

    for (const block of section.blocks) {
      // Banner plus at least one unit, or the banner tops a page by itself.
      ensureRoom(72, { redrawColumns: true });

      doc.rect(M, y, contentW, 22).fillColor(BAND).fill();
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor(INK)
        .text(block.label, M + 10, y + 5.5, { width: TEXT_W });
      doc.font('Helvetica').fontSize(9).fillColor(FAINT).text(
        countLine(block.unitCount, block.itemCount),
        M,
        y + 7,
        { width: contentW - 10, align: 'right' }
      );
      y += 32;

      for (const unit of block.units) {
        const itemLines = Math.max(...itemColumns(unit.items).map((column) => column.length));
        const entryHeight = 20 + itemLines * ITEM_LINE + 12;
        ensureRoom(entryHeight, { redrawColumns: true });

        doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(
          `${unit.roomCodes.length === 1 ? 'Room' : 'Rooms'} ${unit.label}`,
          M,
          y,
          { width: TEXT_W - 70, lineBreak: false, ellipsis: true }
        );
        doc.font('Helvetica').fontSize(9).fillColor(FAINT).text(
          `${unit.itemCount} item${unit.itemCount === 1 ? '' : 's'}`,
          M + TEXT_W - 70,
          y + 1.5,
          { width: 70, align: 'right' }
        );

        checkbox(PACKED_CX, y, unit.checks.packed);
        checkbox(OFD_CX, y, unit.checks.outForDelivery);

        drawItems(unit.items, y + 20);
        y += entryHeight;
        doc.moveTo(M, y - 6).lineTo(W - M, y - 6).lineWidth(0.4).strokeColor(RULE).stroke();
        y += 4;
      }

      y += 10;
    }
  });

  doc.end();
};

export default renderOrdersPrintSheet;
