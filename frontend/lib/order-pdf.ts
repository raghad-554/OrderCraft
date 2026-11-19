/** Client-side purchase-order PDF. Helvetica only — no print dialog. */

export type PurchaseOrderPdfData = {
  documentTitle: string;
  numberLabel: string;
  orderNumber: string;
  vendor: string;
  buyer: string;
  orderDate: string;
  deliveryDate: string;
  paymentTerms: string;
  status: string;
  paymentStatus: string;
  invoiceNumber: string;
  notes: string;
  rejectionReason: string;
  rejected: boolean;
  items: {
    product: string;
    sku: string;
    qty: string;
    unitPrice: string;
    discount: string;
    lineTotal: string;
  }[];
  discount: string;
  subtotal: string;
  taxLabel: string;
  tax: string;
  total: string;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_RIGHT = PAGE_W - MARGIN;
const CONTENT_W = CONTENT_RIGHT - MARGIN;
const BOTTOM = 58;

const NAVY = "#051A2D";
const NAVY_MID = "#0A3050";
const TEAL = "#2DD4A8";
const INK = "#0B1220";
const MUTED = "#5B6577";
const BODY = "#4B5563";
const RULE = "#E6E9EE";
const WASH = "#e8eef4";
const WHITE = "#FFFFFF";
const HEADER_H = 78;

const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 1000, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

type StatusKey =
  | "Draft"
  | "Pending"
  | "Rejected"
  | "Approved"
  | "Shipped"
  | "Delivered"
  | "Cancelled"
  | "Paid"
  | "Unpaid"
  | "Partially Paid"
  | "Overdue";

const PILL: Record<string, { bg: string; fg: string }> = {
  Draft: { bg: "#F1F5F9", fg: "#475569" },
  Pending: { bg: "#FFFBEB", fg: "#B45309" },
  Rejected: { bg: "#FEF2F2", fg: "#B91C1C" },
  Approved: { bg: "#F0F9FF", fg: "#0369A1" },
  Shipped: { bg: "#EEF2FF", fg: "#4338CA" },
  Delivered: { bg: "#ECFDF5", fg: "#047857" },
  Cancelled: { bg: "#F1F5F9", fg: "#64748B" },
  Paid: { bg: "#ECFDF5", fg: "#047857" },
  Unpaid: { bg: "#F1F5F9", fg: "#475569" },
  "Partially Paid": { bg: "#FFFBEB", fg: "#B45309" },
  Overdue: { bg: "#FEF2F2", fg: "#B91C1C" },
};

function latin(value: string) {
  return value
    .replace(/[→▸►]/g, "->")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, "?");
}

function pdfEscape(value: string) {
  return latin(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function rgb(hex: string) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function glyphWidth(ch: string, bold: boolean) {
  const code = ch.charCodeAt(0);
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  if (code < 32 || code > 126) return 556;
  return table[code - 32] ?? 556;
}

function textWidth(value: string, size: number, bold = false) {
  let w = 0;
  for (const ch of latin(value)) w += glyphWidth(ch, bold);
  return (w * size) / 1000;
}

function wrapText(value: string, size: number, maxWidth: number, bold = false) {
  const text = latin(value).trim() || "";
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  const flushChunk = (chunk: string) => {
    if (textWidth(chunk, size, bold) <= maxWidth) {
      const next = line ? `${line} ${chunk}` : chunk;
      if (textWidth(next, size, bold) <= maxWidth) {
        line = next;
        return;
      }
      if (line) lines.push(line);
      line = chunk;
      return;
    }
    if (line) {
      lines.push(line);
      line = "";
    }
    let piece = "";
    for (const ch of chunk) {
      const next = piece + ch;
      if (textWidth(next, size, bold) <= maxWidth) piece = next;
      else {
        if (piece) lines.push(piece);
        piece = ch;
      }
    }
    line = piece;
  };

  for (const word of words) flushChunk(word);
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

class Page {
  ops: string[] = [];
  add(op: string) {
    this.ops.push(op);
  }
  stream() {
    return this.ops.join("");
  }
}

function fillRect(page: Page, x: number, y: number, w: number, h: number, color: string) {
  page.add(`${rgb(color)} rg\n${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re\nf\n`);
}

function strokeLine(
  page: Page,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 0.7,
) {
  page.add(
    `${rgb(color)} RG\n${width} w\n${x1.toFixed(2)} ${y1.toFixed(2)} m\n${x2.toFixed(2)} ${y2.toFixed(2)} l\nS\n`,
  );
}

function drawText(
  page: Page,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  bold = false,
) {
  page.add(
    `BT\n/${bold ? "F2" : "F1"} ${size} Tf\n${rgb(color)} rg\n1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm\n(${pdfEscape(value)}) Tj\nET\n`,
  );
}

function drawRight(
  page: Page,
  value: string,
  right: number,
  y: number,
  size: number,
  color: string,
  bold = false,
) {
  drawText(page, value, right - textWidth(value, size, bold), y, size, color, bold);
}

function assemblePdf(streams: string[]) {
  const parts: string[] = ["%PDF-1.4\n"];
  const offsets = [0];
  let pos = parts[0].length;

  const add = (body: string) => {
    const id = offsets.length;
    const obj = `${id} 0 obj\n${body}\nendobj\n`;
    offsets.push(pos);
    parts.push(obj);
    pos += obj.length;
    return id;
  };

  add("<< /Type /Catalog /Pages 2 0 R >>");
  const pageCount = streams.length;
  const fontRegular = 3;
  const fontBold = 4;
  const firstPage = 5;
  const kids = streams.map((_, i) => `${firstPage + i * 2} 0 R`).join(" ");
  add(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  streams.forEach((raw) => {
    const stream = raw.endsWith("\n") ? raw : `${raw}\n`;
    const pageId = offsets.length;
    const contentId = pageId + 1;
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> >>`,
    );
    add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  });

  const xrefPos = pos;
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  parts.push(xref, trailer);
  return new TextEncoder().encode(parts.join(""));
}

function pillColors(label: string) {
  return PILL[label as StatusKey] ?? { bg: "#d4dee9", fg: "#4B5563" };
}

function drawPill(page: Page, label: string, x: number, y: number) {
  const padX = 8;
  const size = 8;
  const w = Math.ceil(textWidth(label, size, true) + padX * 2);
  const h = 16;
  const colors = pillColors(label);
  fillRect(page, x, y, w, h, colors.bg);
  drawText(page, label, x + padX, y + 4.5, size, colors.fg, true);
  return w;
}

function drawHeader(page: Page, data: PurchaseOrderPdfData, continued: boolean) {
  fillRect(page, 0, PAGE_H - HEADER_H, PAGE_W, HEADER_H, NAVY);
  fillRect(page, 0, PAGE_H - HEADER_H - 3, PAGE_W, 3, TEAL);
  drawText(page, "OrderCraft", MARGIN, PAGE_H - 36, 18, WHITE, true);
  drawText(
    page,
    continued ? `${data.documentTitle}  -  continued` : data.documentTitle,
    MARGIN,
    PAGE_H - 54,
    9,
    TEAL,
  );
  drawText(
    page,
    data.numberLabel,
    CONTENT_RIGHT - textWidth(data.numberLabel, 8, true),
    PAGE_H - 32,
    8,
    MUTED,
    true,
  );
  drawRight(page, data.orderNumber, CONTENT_RIGHT, PAGE_H - 52, 16, TEAL, true);
}

function drawFooter(page: Page, index: number, total: number) {
  fillRect(page, MARGIN, 38, 24, 3, TEAL);
  strokeLine(page, MARGIN + 28, 39.5, CONTENT_RIGHT, 39.5, RULE, 0.6);
  drawText(page, "OrderCraft - B2B procurement", MARGIN, 22, 8, NAVY, true);
  drawRight(page, `Page ${index + 1} of ${total}`, CONTENT_RIGHT, 22, 8, MUTED);
}

export function buildPurchaseOrderPdf(data: PurchaseOrderPdfData) {
  const pages: Page[] = [];
  let page = new Page();
  pages.push(page);
  let y = PAGE_H - HEADER_H - 28;

  const ensure = (need: number) => {
    if (y - need >= BOTTOM) return;
    page = new Page();
    pages.push(page);
    drawHeader(page, data, true);
    y = PAGE_H - HEADER_H - 28;
  };

  drawHeader(page, data, false);

  const col = CONTENT_W / 2;
  drawText(page, "VENDOR", MARGIN, y, 8, MUTED, true);
  drawText(page, "BUYER", MARGIN + col + 12, y, 8, MUTED, true);
  y -= 16;
  const vendorLines = wrapText(data.vendor || "—", 12, col - 16, true);
  const buyerLines = wrapText(data.buyer || "—", 12, col - 16, true);
  const partyLines = Math.max(vendorLines.length, buyerLines.length);
  vendorLines.forEach((line, i) => drawText(page, line, MARGIN, y - i * 15, 12, INK, true));
  buyerLines.forEach((line, i) => drawText(page, line, MARGIN + col + 12, y - i * 15, 12, INK, true));
  strokeLine(page, MARGIN + col, y + 14, MARGIN + col, y - partyLines * 15 + 6, RULE, 0.7);
  y -= partyLines * 15 + 18;

  y -= 8;
  const facts = [
    { label: "DATE", value: data.orderDate || "—" },
    { label: "DELIVERY", value: data.deliveryDate || "—" },
    { label: "PAYMENT TERMS", value: data.paymentTerms || "—" },
  ];
  const factW = CONTENT_W / 3;
  fillRect(page, MARGIN, y - 36, CONTENT_W, 48, WASH);
  facts.forEach((fact, i) => {
    const x = MARGIN + 12 + i * factW;
    drawText(page, fact.label, x, y, 8, MUTED, true);
    wrapText(fact.value, 11, factW - 18, true).forEach((line, li) =>
      drawText(page, line, x, y - 14 - li * 13, 11, NAVY, true),
    );
  });
  y -= 52;

  let pillX = MARGIN;
  pillX += drawPill(page, data.status, pillX, y) + 6;
  pillX += drawPill(page, data.paymentStatus, pillX, y) + 6;
  if (data.invoiceNumber) drawPill(page, data.invoiceNumber, pillX, y);
  y -= 28;

  if (data.rejectionReason) {
    const prefix = data.rejected ? "Rejection reason: " : "Last rejection: ";
    const lines = wrapText(prefix + data.rejectionReason, 10, CONTENT_W - 24);
    const boxH = lines.length * 13 + 16;
    ensure(boxH + 12);
    fillRect(page, MARGIN, y - boxH + 6, CONTENT_W, boxH, "#FEF2F2");
    lines.forEach((line, i) => drawText(page, line, MARGIN + 12, y - 8 - i * 13, 10, "#B91C1C"));
    y -= boxH + 12;
  }

  if (data.notes) {
    const lines = wrapText(data.notes, 10, CONTENT_W - 24);
    const boxH = lines.length * 13 + 16;
    ensure(boxH + 12);
    fillRect(page, MARGIN, y - boxH + 6, CONTENT_W, boxH, WASH);
    lines.forEach((line, i) => drawText(page, line, MARGIN + 12, y - 8 - i * 13, 10, BODY));
    y -= boxH + 18;
  }

  const items = data.items.length
    ? data.items
    : [{ product: "No line items.", sku: "", qty: "", unitPrice: "", discount: "", lineTotal: "" }];

  const innerPad = 10;
  const colGap = 10;
  const qtyW = Math.max(
    36,
    textWidth("QTY", 8, true) + 8,
    ...items.map((item) => textWidth(item.qty, 10) + 8),
  );
  const unitW = Math.max(
    68,
    textWidth("UNIT PRICE", 8, true) + 8,
    ...items.map((item) => textWidth(item.unitPrice, 10) + 10),
  );
  const discountW = Math.max(
    64,
    textWidth("DISCOUNT", 8, true) + 8,
    ...items.map((item) => textWidth(item.discount, 10) + 10),
  );
  const totalW = Math.max(
    72,
    textWidth("LINE TOTAL", 8, true) + 8,
    ...items.map((item) => textWidth(item.lineTotal, 10, true) + 10),
  );
  const skuW = 64;
  const productW = Math.max(
    90,
    CONTENT_W - innerPad * 2 - skuW - qtyW - unitW - discountW - totalW - colGap * 5,
  );
  let x = MARGIN + innerPad;
  const cols = {
    product: { x, w: productW, label: "PRODUCT" },
    sku: { x: (x += productW + colGap), w: skuW, label: "SKU" },
    qty: { x: (x += skuW + colGap), w: qtyW, label: "QTY", right: true },
    unit: { x: (x += qtyW + colGap), w: unitW, label: "UNIT PRICE", right: true },
    discount: { x: (x += unitW + colGap), w: discountW, label: "DISCOUNT", right: true },
    total: { x: (x += discountW + colGap), w: totalW, label: "LINE TOTAL", right: true },
  };

  const drawTableHead = () => {
    fillRect(page, MARGIN, y - 10, CONTENT_W, 24, NAVY_MID);
    (Object.values(cols) as { x: number; w: number; label: string; right?: boolean }[]).forEach(
      (colDef) => {
        if (colDef.right) drawRight(page, colDef.label, colDef.x + colDef.w, y, 8, WHITE, true);
        else drawText(page, colDef.label, colDef.x, y, 8, WHITE, true);
      },
    );
    y -= 22;
  };

  ensure(48);
  drawTableHead();

  items.forEach((item, index) => {
    const productLines = wrapText(item.product, 10, cols.product.w - 6, true);
    const skuLines = wrapText(item.sku || "—", 10, cols.sku.w - 6);
    const rowH = Math.max(productLines.length, skuLines.length) * 13 + 10;
    if (y - rowH < BOTTOM + 8) {
      ensure(48);
      drawTableHead();
    }
    if (index > 0) strokeLine(page, MARGIN, y + 12, CONTENT_RIGHT, y + 12, RULE, 0.4);
    productLines.forEach((line, i) => drawText(page, line, cols.product.x, y - i * 13, 10, INK, true));
    skuLines.forEach((line, i) => drawText(page, line, cols.sku.x, y - i * 13, 10, BODY));
    if (item.qty) drawRight(page, item.qty, cols.qty.x + cols.qty.w, y, 10, BODY);
    if (item.unitPrice) drawRight(page, item.unitPrice, cols.unit.x + cols.unit.w, y, 10, BODY);
    if (item.discount) drawRight(page, item.discount, cols.discount.x + cols.discount.w, y, 10, BODY);
    if (item.lineTotal) drawRight(page, item.lineTotal, cols.total.x + cols.total.w, y, 10, INK, true);
    y -= rowH;
  });

  ensure(120);
  y -= 10;
  const amountW = Math.max(
    textWidth(data.discount, 11, true),
    textWidth(data.subtotal, 11, true),
    textWidth(data.tax, 11, true),
    textWidth(data.total, 11, true),
  );
  const labelW = Math.max(
    textWidth("Discount", 11, true),
    textWidth("Subtotal", 11, true),
    textWidth(data.taxLabel, 11, true),
    textWidth("Grand total", 11, true),
  );
  const totalsW = Math.min(CONTENT_W, Math.max(250, labelW + amountW + 36));
  const totalsX = CONTENT_RIGHT - totalsW;
  const totalsRight = CONTENT_RIGHT - 12;
  fillRect(page, totalsX, y - 70, totalsW, 64, WASH);
  drawText(page, "Discount", totalsX + 12, y - 8, 10, BODY);
  drawRight(page, data.discount, totalsRight, y - 8, 10, INK, true);
  drawText(page, "Subtotal", totalsX + 12, y - 24, 10, BODY);
  drawRight(page, data.subtotal, totalsRight, y - 24, 10, INK, true);
  drawText(page, data.taxLabel, totalsX + 12, y - 40, 10, BODY);
  drawRight(page, data.tax, totalsRight, y - 40, 10, INK, true);
  fillRect(page, totalsX, y - 96, totalsW, 26, NAVY);
  drawText(page, "Grand total", totalsX + 12, y - 79, 11, WHITE, true);
  drawRight(page, data.total, totalsRight, y - 79, 11, TEAL, true);

  pages.forEach((p, i) => drawFooter(p, i, pages.length));
  return assemblePdf(pages.map((p) => p.stream()));
}
