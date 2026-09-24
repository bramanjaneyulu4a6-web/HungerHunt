import PDFDocument from 'pdfkit';

const INK = '#111111';
const MUTED = '#555555';
const RULE = '#bbbbbb';

export const renderCaretakerReceivingSheet = (sheet, stream) => {
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  doc.pipe(stream);

  const width = doc.page.width;
  const height = doc.page.height;
  const margin = 42;
  const contentWidth = width - margin * 2;
  const bottom = height - margin;
  let y = margin;
  let hasPage = false;

  const stamp = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata',
  }).format(sheet.generatedAt);

  const addPage = () => {
    if (hasPage) doc.addPage();
    hasPage = true;
    y = margin;
  };

  const continuation = (group) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(MUTED)
      .text(`${group.caretakerName} - continued`, margin, y, {
        width: contentWidth,
        lineBreak: false,
        ellipsis: true,
      });
    y += 24;
  };

  const ensure = (needed, group) => {
    if (y + needed <= bottom) return;
    doc.addPage();
    y = margin;
    continuation(group);
  };

  const drawCaretaker = (group) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
      .text('CARETAKER TOTAL ORDERS TO BE RECEIVED', margin, y, {
        width: contentWidth,
        lineBreak: false,
      });
    y += 18;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK)
      .text(group.caretakerName, margin, y, {
        width: contentWidth,
        lineBreak: false,
        ellipsis: true,
      });
    y += 29;

    const rooms = group.rooms.map((room) => room.roomNumber).join(' · ');
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
      .text(`${group.roomCount === 1 ? 'Room' : 'Rooms'} ${rooms}`, margin, y, {
        width: contentWidth,
        lineBreak: false,
        ellipsis: true,
      });
    y += 17;
    doc.text(
      `${group.orderCount} order${group.orderCount === 1 ? '' : 's'} · ` +
        `${group.itemCount} item${group.itemCount === 1 ? '' : 's'} to receive`,
      margin,
      y,
      { width: contentWidth, lineBreak: false }
    );
    y += 25;

    if (group.unassigned) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED)
        .text('These rooms have no active caretaker assigned.', margin, y);
      y += 20;
    }

    doc.moveTo(margin, y).lineTo(width - margin, y)
      .lineWidth(0.8).strokeColor(RULE).stroke();
    y += 10;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
      .text('ITEMS TO RECEIVE', margin, y);
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      .text(`${group.items.length} product type${group.items.length === 1 ? '' : 's'}`,
        width - margin - 160, y + 1, { width: 160, align: 'right', lineBreak: false });
    y += 23;

    for (const item of group.items) {
      ensure(17, group);
      doc.font('Helvetica').fontSize(10).fillColor(INK)
        .text(item.name, margin + 10, y, {
          width: contentWidth - 70,
          lineBreak: false,
          ellipsis: true,
        });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
        .text(`×${item.quantity}`, width - margin - 50, y, {
          width: 50,
          align: 'right',
          lineBreak: false,
        });
      y += 16;
    }
  };

  for (const group of sheet.groups) {
    addPage();
    drawCaretaker(group);
  }

  if (!sheet.groups.length) {
    addPage();
    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK)
      .text('Hunger Hunt - Orders list', margin, y);
    y += 32;
    doc.font('Helvetica').fontSize(10).fillColor(MUTED)
      .text('There are no orders in the selected stages.', margin, y);
  }

  const stageLine = sheet.stages.map((stage) => stage.label).join(' · ');
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    doc.switchToPage(pages.start + index);
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text(`Printed ${stamp} | ${stageLine} | Page ${index + 1} of ${pages.count}`,
        margin, height - 28, { width: contentWidth, align: 'right', lineBreak: false });
  }

  doc.end();
};

export default renderCaretakerReceivingSheet;
