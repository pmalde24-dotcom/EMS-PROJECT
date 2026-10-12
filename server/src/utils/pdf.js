'use strict';
const PDFDocument = require('pdfkit');

/**
 * Streams a PDFKit document to the response. `build(doc)` draws the content.
 * Use for payslips, offer letters, relieving/experience letters, reports.
 */
function streamPDF(res, filename, build, { title = 'Document', author = 'EMS' } = {}) {
  const doc = new PDFDocument({ margin: 48, size: 'A4', info: { Title: title, Author: author } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  build(doc);
  doc.end();
}

const inr = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const line = (doc, y) => doc.moveTo(48, y).lineTo(547, y).strokeColor('#e5e7eb').stroke();

function header(doc, { company = 'Company Pvt. Ltd.', subtitle = '', title = '' }) {
  doc.fillColor('#4f46e5').fontSize(18).font('Helvetica-Bold').text(company);
  doc.fillColor('#6b7280').fontSize(9).font('Helvetica').text(subtitle);
  doc.moveDown(0.4);
  if (title) {
    doc.fillColor('#111827').fontSize(14).font('Helvetica-Bold').text(title, { align: 'left' });
  }
  doc.moveDown(0.5);
  line(doc, doc.y);
  doc.moveDown(0.8);
  return doc.y;
}
function table(doc, rows, { colWidths, startY } = {}) {
  const widths = colWidths || [200, 100, 90, 100];
  let y = startY ?? doc.y;
  const x = 48;
  rows.forEach((row, i) => {
    let cx = x;
    row.forEach((cell, ci) => {
      doc.fillColor(i === 0 ? '#374151' : '#111827')
        .fontSize(i === 0 ? 9.5 : 9)
        .font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .text(String(cell), cx, y, { width: widths[ci], align: ci === 0 ? 'left' : 'right' });
      cx += widths[ci];
    });
    y += 20;
    if (i < rows.length - 1) line(doc, y - 6);
  });
  doc.y = y + 6;
  return y;
}
module.exports = { streamPDF, header, table, inr, line };
