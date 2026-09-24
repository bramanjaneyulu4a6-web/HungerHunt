import PDFDocument from 'pdfkit';

const INK = '#111111';
const MUTED = '#555555';
const RULE = '#c7c7c7';
const BAND = '#eeeeee';

const STATUS_LABELS = Object.freeze({
  AWAITING_PARENT: 'Awaiting parent approval',
  PENDING: 'New order',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for delivery',
});

export const renderActiveOrdersExport = (report, stream) => {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  doc.pipe(stream);

  const width = doc.page.width;
  const height = doc.page.height;
  const margin = 42;
  const contentWidth = width - margin * 2;
  const bottom = height - margin;
  let y = margin;
  let hasPage = false;

  const addPage = () => {
    if (hasPage) doc.addPage();
    hasPage = true;
    y = margin;
  };

  const ensure = (needed, continuation) => {
    if (y + needed <= bottom) return;
    doc.addPage();
    y = margin;
    if (continuation) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(MUTED)
        .text(`${continuation} - continued`, margin, y);
      y = doc.y + 14;
    }
  };

  const stamp = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata',
  }).format(report.generatedAt);

  const groupHeader = (group) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
      .text('ACTIVE ORDERS BY CARETAKER', margin, y);
    y += 18;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK);
    const nameHeight = doc.heightOfString(group.caretakerName, { width: contentWidth });
    doc.text(group.caretakerName, margin, y, { width: contentWidth });
    y += nameHeight + 6;
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(
      `${group.roomCount} room${group.roomCount === 1 ? '' : 's'} · ` +
      `${group.childCount} child${group.childCount === 1 ? '' : 'ren'} · ` +
      `${group.itemCount} item${group.itemCount === 1 ? '' : 's'}`,
      margin,
      y
    );
    y += 27;
  };

  const sectionHeading = (label, summary, continuation) => {
    ensure(32, continuation);
    doc.moveTo(margin, y).lineTo(width - margin, y)
      .lineWidth(0.8).strokeColor(RULE).stroke();
    y += 9;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
      .text(label.toUpperCase(), margin, y, { lineBreak: false });
    if (summary) {
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
        .text(summary, width - margin - 190, y + 1, {
          width: 190,
          align: 'right',
          lineBreak: false,
          ellipsis: true,
        });
    }
    y += 22;
  };

  const roomBand = (room, continuation) => {
    ensure(34, continuation);
    doc.rect(margin, y, contentWidth, 22).fillColor(BAND).fill();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
      .text(`Room ${room.roomNumber}`, margin + 9, y + 5.5, {
        width: contentWidth - 18,
        lineBreak: false,
        ellipsis: true,
      });
    y += 30;
  };

  // One complete handout per caretaker: totals first, then the student detail.
  // A new caretaker always begins on a fresh page.
  for (const group of report.groups) {
    addPage();
    groupHeader(group);
    if (group.unassigned) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED)
        .text('These rooms have no active caretaker assigned.', margin, y);
      y = doc.y + 12;
    }

    sectionHeading(
      'Items handed to caretaker',
      `${group.itemCount} item${group.itemCount === 1 ? '' : 's'} total`,
      group.caretakerName
    );
    for (const item of group.items) {
      ensure(16, `${group.caretakerName} - item totals`);
      doc.font('Helvetica').fontSize(10).fillColor(INK)
        .text(item.name, margin + 10, y, {
          width: contentWidth - 70,
          lineBreak: false,
          ellipsis: true,
        });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
        .text(`×${item.quantity}`, width - margin - 50, y, { width: 50, align: 'right' });
      y += 15;
    }
    y += 10;

    sectionHeading(
      'Detailed orders by student',
      `${group.childCount} child${group.childCount === 1 ? '' : 'ren'}`,
      group.caretakerName
    );
    for (const room of group.rooms) {
      roomBand(room, group.caretakerName);
      for (const order of room.orders) {
        const itemLines = Math.max(order.items.length, 1);
        ensure(33 + itemLines * 13, `${group.caretakerName} - Room ${room.roomNumber}`);
        const student = order.admissionNumber
          ? `${order.studentName} · ${order.admissionNumber}`
          : order.studentName;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
          .text(student, margin + 10, y, {
            width: contentWidth - 160,
            lineBreak: false,
            ellipsis: true,
          });
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
          .text(STATUS_LABELS[order.status] || order.status || 'Active', width - margin - 150, y + 1,
            { width: 150, align: 'right', lineBreak: false, ellipsis: true });
        y = Math.max(doc.y, y + 13) + 4;
        for (const item of order.items) {
          doc.font('Helvetica').fontSize(9).fillColor(INK)
            .text(item.name, margin + 22, y, {
              width: contentWidth - 80,
              lineBreak: false,
              ellipsis: true,
            });
          doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
            .text(`×${item.quantity}`, width - margin - 50, y, { width: 50, align: 'right' });
          y += 13;
        }
        y += 7;
        doc.moveTo(margin + 10, y).lineTo(width - margin, y)
          .lineWidth(0.4).strokeColor(RULE).stroke();
        y += 8;
      }
      y += 4;
    }
  }

  if (!report.groups.length) {
    addPage();
    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK).text('Active orders export', margin, y);
    y = doc.y + 12;
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('There are no active orders.', margin, y);
  }

  // Number and timestamp every page after layout, including continuation
  // pages PDFKit added while a long caretaker section was being drawn.
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    doc.switchToPage(pages.start + index);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
      `Generated ${stamp} | Page ${index + 1} of ${pages.count}`,
      margin,
      height - 28,
      { width: contentWidth, align: 'right', lineBreak: false }
    );
  }
  doc.end();
};

export default renderActiveOrdersExport;
