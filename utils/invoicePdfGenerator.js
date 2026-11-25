import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMPANY_INFO = {
  name: process.env.COMPANY_LEGAL_NAME || 'Inxyme',
  tagline: 'Skill Development & Career Training Platform',
  website: 'www.inxyme.com',
  email: process.env.EMAIL_FROM_ADDRESS || 'info@inxyme.com',
  phone: '+91 9891030303',
  gstin: process.env.COMPANY_GSTIN || '',
};

export const PAYMENT_METHOD_LABELS = {
  razorpay: 'Razorpay (Online)',
  upi: 'UPI Transfer',
  bank_transfer: 'Bank Transfer (NEFT / IMPS / RTGS)',
  cash: 'Cash',
  card: 'Credit / Debit Card',
  cheque: 'Cheque / DD',
  other: 'Other',
};

export const formatPaymentMethodLabel = (method) => {
  if (!method) return 'Online Payment';
  return PAYMENT_METHOD_LABELS[method] || String(method).replace(/_/g, ' ').toUpperCase();
};

/**
 * Compute GST breakup (18% inclusive by default) accurate to 2 decimal places.
 */
export const computeGstBreakup = (amount, gstRate = 18, gstInclusive = true) => {
  const numericAmount = Math.max(0, Number(amount) || 0);
  const rate = Math.max(0, Number(gstRate ?? 18));

  if (rate === 0 || numericAmount === 0) {
    return {
      gstRate: rate,
      gstInclusive: Boolean(gstInclusive),
      taxableValue: Number(numericAmount.toFixed(2)),
      cgstRate: 0,
      sgstRate: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      totalGst: 0,
      grandTotal: Number(numericAmount.toFixed(2)),
    };
  }

  if (gstInclusive) {
    const taxableValue = Number((numericAmount / (1 + rate / 100)).toFixed(2));
    const totalGst = Number((numericAmount - taxableValue).toFixed(2));
    const cgstAmount = Number((totalGst / 2).toFixed(2));
    const sgstAmount = Number((totalGst - cgstAmount).toFixed(2));
    return {
      gstRate: rate,
      gstInclusive: true,
      taxableValue,
      cgstRate: Number((rate / 2).toFixed(2)),
      sgstRate: Number((rate / 2).toFixed(2)),
      cgstAmount,
      sgstAmount,
      totalGst,
      grandTotal: Number(numericAmount.toFixed(2)),
    };
  }

  const taxableValue = Number(numericAmount.toFixed(2));
  const cgstAmount = Number(((taxableValue * (rate / 2)) / 100).toFixed(2));
  const sgstAmount = Number(((taxableValue * (rate / 2)) / 100).toFixed(2));
  const totalGst = Number((cgstAmount + sgstAmount).toFixed(2));
  return {
    gstRate: rate,
    gstInclusive: false,
    taxableValue,
    cgstRate: Number((rate / 2).toFixed(2)),
    sgstRate: Number((rate / 2).toFixed(2)),
    cgstAmount,
    sgstAmount,
    totalGst,
    grandTotal: Number((taxableValue + totalGst).toFixed(2)),
  };
};

export const formatInrAscii = (amount) => {
  const num = Number(amount) || 0;
  return `Rs. ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const formatInrDisplay = (amount) => {
  const num = Number(amount) || 0;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Convert number to Indian Rupees words (Crores / Lakhs / Thousands).
 */
export const numberToIndianWords = (amount) => {
  const num = Number(amount) || 0;
  if (num === 0) return 'Zero Rupees Only';

  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (n) => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    return `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`.trim();
  };

  const threeDigits = (n) => {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    return `${h ? ones[h] + ' Hundred' : ''}${h && rem ? ' ' : ''}${twoDigits(rem)}`.trim();
  };

  const whole = Math.floor(num);
  const paise = Math.round((num - whole) * 100);

  const convertWhole = (n) => {
    if (n === 0) return 'Zero';
    const parts = [];
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const rest = n % 1000;

    if (crore) parts.push(`${convertWhole(crore)} Crore`);
    if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
    if (rest) parts.push(threeDigits(rest));
    return parts.join(' ').trim();
  };

  const rupeesPart = `Indian Rupees ${convertWhole(whole)}`;
  if (paise > 0) {
    return `${rupeesPart} and ${twoDigits(paise)} Paise Only`;
  }
  return `${rupeesPart} Only`;
};

/**
 * Strip characters unsupported by StandardFonts WinAnsi encoding so pdf-lib never throws.
 */
const safePdfText = (value) => {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/₹/g, 'Rs. ')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, '*')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const wrapTextLines = (text, font, size, maxWidth) => {
  const cleaned = safePdfText(text);
  if (!cleaned) return [];
  const words = cleaned.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // If a single long token exceeds maxWidth, hard-wrap it
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) {
            chunk += ch;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
};

const formatDateShort = (dateInput) => {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export const escapeHtml = (unsafe = '') => {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export const getInvoiceFilename = (payment) => {
  const inv = (payment?.invoiceNumber || `INV-${String(payment?._id || '').slice(-6).toUpperCase()}`).replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  return `Invoice_${inv}.pdf`;
};

/**
 * Build default written email content & branded HTML email preview for a payment.
 */
export const buildInvoiceEmailContent = (payment, overrides = {}) => {
  const invoiceNumber =
    payment.invoiceNumber || `INV-${String(payment._id || '').slice(-6).toUpperCase()}`;
  const studentName = payment.name || 'Student';
  const courseName = payment.course || 'Course Program';
  const paidDate = formatDateShort(payment.paymentDate || payment.createdAt);
  const methodLabel = formatPaymentMethodLabel(payment.paymentMethod);
  const refId = payment.transactionId || payment.paymentId || payment.orderId || String(payment._id || '');
  const gst = computeGstBreakup(
    payment.paymentAmount,
    payment.gstRate ?? 18,
    payment.gstInclusive !== false
  );

  const defaultSubject = `Payment Receipt & Tax Invoice (${invoiceNumber}) - ${courseName} | Inxyme`;
  const defaultWrittenMessage = [
    `Dear ${studentName},`,
    '',
    `Thank you for your payment of ${formatInrDisplay(gst.grandTotal)} towards "${courseName}" (${payment.installmentLabel || 'Course Fee'}).`,
    '',
    `Your payment has been recorded under Invoice Number ${invoiceNumber} on ${paidDate}. Please find your official Tax Invoice / Payment Receipt PDF attached with this email for your records.`,
    ...(Number(payment.previouslyPaidAmount) > 0
      ? [
          '',
          `Previously Paid for this course: ${formatInrDisplay(payment.previouslyPaidAmount)}.`,
        ]
      : []),
    ...(Number(payment.balanceDue) > 0
      ? [
          '',
          `Note: Remaining balance fee for this course is ${formatInrDisplay(payment.balanceDue)}.`,
        ]
      : []),
    '',
    'If you have any questions regarding your enrollment or payment receipt, feel free to reply to this email or contact our support team.',
    '',
    'Best regards,',
    'Accounts & Student Support Team',
    'Inxyme (www.inxyme.com)',
  ].join('\n');

  const subject = (overrides.subject || payment.invoiceEmailSubject || defaultSubject).trim();
  const writtenMessage = (
    overrides.writtenMessage !== undefined
      ? overrides.writtenMessage
      : payment.invoiceEmailMessage || defaultWrittenMessage
  ).trim();

  const messageHtmlBody = escapeHtml(writtenMessage).replace(/\r?\n/g, '<br />');
  const statusText = (payment.status || 'completed').toUpperCase();
  const statusColors =
    payment.status === 'completed'
      ? { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' }
      : payment.status === 'failed'
      ? { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' }
      : { bg: '#fffbeb', text: '#b45309', border: '#fde68a' };

  const emailLogoSrc = overrides.useCidLogo
    ? 'cid:inxyme-logo'
    : 'https://www.inxyme.com/images/inxyme-logo.png';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
  <div style="max-width:640px;margin:24px auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
    <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);padding:20px 28px;color:#ffffff;border-bottom:3px solid #f47c26;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;">
            <table style="border-collapse:collapse;">
              <tr>
                <td style="background:#ffffff;border-radius:8px;padding:6px 10px;">
                  <img src="${emailLogoSrc}" alt="Inxyme" height="36" style="display:block;height:36px;width:auto;" />
                </td>
                <td style="padding-left:14px;vertical-align:middle;">
                  <div style="font-size:18px;font-weight:800;letter-spacing:0.3px;color:#ffffff;">Inxyme</div>
                  <div style="font-size:12px;color:#bfdbfe;margin-top:2px;">Official Payment Receipt &amp; Tax Invoice</div>
                </td>
              </tr>
            </table>
          </td>
          <td style="text-align:right;vertical-align:middle;">
            <span style="display:inline-block;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:700;background-color:${statusColors.bg};color:${statusColors.text};border:1px solid ${statusColors.border};">
              ${escapeHtml(statusText)}
            </span>
          </td>
        </tr>
      </table>
    </div>

    <div style="padding:28px;">
      <div style="font-size:14px;line-height:1.7;color:#1f2937;margin-bottom:24px;">
        ${messageHtmlBody}
      </div>

      <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#4f46e5;margin-bottom:12px;">
          Payment &amp; Invoice Summary
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:44%;">Invoice Number</td>
            <td style="padding:6px 0;font-weight:700;color:#0f172a;text-align:right;">${escapeHtml(invoiceNumber)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;">Student Name</td>
            <td style="padding:6px 0;font-weight:600;color:#0f172a;text-align:right;">${escapeHtml(studentName)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;">Course / Program</td>
            <td style="padding:6px 0;font-weight:600;color:#0f172a;text-align:right;">${escapeHtml(courseName)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;">Payment Date</td>
            <td style="padding:6px 0;color:#0f172a;text-align:right;">${escapeHtml(paidDate)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;">Payment Mode</td>
            <td style="padding:6px 0;color:#0f172a;text-align:right;">${escapeHtml(methodLabel)}</td>
          </tr>
          ${
            refId
              ? `<tr>
                  <td style="padding:6px 0;color:#64748b;">Transaction / Ref ID</td>
                  <td style="padding:6px 0;font-family:monospace;color:#0f172a;text-align:right;">${escapeHtml(refId)}</td>
                </tr>`
              : ''
          }
          <tr>
            <td style="padding:6px 0;color:#64748b;">Taxable Value</td>
            <td style="padding:6px 0;color:#334155;text-align:right;">${escapeHtml(formatInrDisplay(gst.taxableValue))}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;">GST (${gst.gstRate}% Inclusive)</td>
            <td style="padding:6px 0;color:#334155;text-align:right;">${escapeHtml(formatInrDisplay(gst.totalGst))}</td>
          </tr>
          <tr style="border-top:1px solid #cbd5e1;">
            <td style="padding:10px 0 4px;font-weight:700;color:#0f172a;font-size:14px;">Total Amount Paid</td>
            <td style="padding:10px 0 4px;font-weight:800;color:#4338ca;font-size:16px;text-align:right;">${escapeHtml(formatInrDisplay(gst.grandTotal))}</td>
          </tr>
          ${
            Number(payment.previouslyPaidAmount) > 0
              ? `<tr>
                  <td style="padding:4px 0;color:#047857;font-weight:600;">Previously Paid (Earlier)</td>
                  <td style="padding:4px 0;color:#047857;font-weight:700;text-align:right;">- ${escapeHtml(formatInrDisplay(payment.previouslyPaidAmount))}</td>
                </tr>`
              : ''
          }
          ${
            Number(payment.balanceDue) > 0
              ? `<tr>
                  <td style="padding:4px 0;color:#b45309;font-weight:600;">Balance Remaining</td>
                  <td style="padding:4px 0;color:#b45309;font-weight:700;text-align:right;">${escapeHtml(formatInrDisplay(payment.balanceDue))}</td>
                </tr>`
              : ''
          }
        </table>
      </div>

      <div style="background-color:#eef2ff;border-left:4px solid #4f46e5;padding:12px 14px;border-radius:6px;font-size:12px;color:#312e81;">
        <strong>Attachment Included:</strong> Your Tax Invoice PDF (<code>${escapeHtml(getInvoiceFilename(payment))}</code>) is attached to this email.
      </div>
    </div>

    <div style="background-color:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;text-align:center;">
      <div><strong>${escapeHtml(COMPANY_INFO.name)}</strong> &bull; ${escapeHtml(COMPANY_INFO.website)}</div>
      <div style="margin-top:4px;">Support: ${escapeHtml(COMPANY_INFO.email)} &bull; ${escapeHtml(COMPANY_INFO.phone)}</div>
    </div>
  </div>
</body>
</html>`;

  return {
    to: (overrides.to || payment.email || '').trim(),
    subject,
    writtenMessage,
    text: writtenMessage,
    html,
    gstBreakup: gst,
    pdfFilename: getInvoiceFilename(payment),
  };
};

/**
 * Generate a crisp, executive A4 Tax Invoice / Payment Receipt PDF buffer via pdf-lib.
 */
export const generatePaymentInvoicePdfBuffer = async (payment) => {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  const contentWidth = width - margin * 2;

  const colors = {
    indigoDark: rgb(0.059, 0.145, 0.345), // deep brand navy-blue
    indigo: rgb(0, 0.408, 0.851), // brand blue #0068D9
    redAccent: rgb(0.957, 0.486, 0.149), // brand orange #F47C26
    slate900: rgb(0.059, 0.09, 0.165),
    slate700: rgb(0.2, 0.255, 0.333),
    slate500: rgb(0.392, 0.455, 0.545),
    slate200: rgb(0.886, 0.91, 0.941),
    slate50: rgb(0.973, 0.98, 0.988),
    greenBg: rgb(0.925, 0.992, 0.961),
    greenText: rgb(0.016, 0.471, 0.341),
    amberBg: rgb(1, 0.984, 0.922),
    amberText: rgb(0.706, 0.325, 0.035),
    redBg: rgb(0.996, 0.949, 0.949),
    redText: rgb(0.725, 0.11, 0.11),
    white: rgb(1, 1, 1),
  };

  // Top decorative bands (brand blue + orange accent)
  page.drawRectangle({
    x: 0,
    y: height - 10,
    width,
    height: 10,
    color: colors.indigo,
  });
  page.drawRectangle({
    x: 0,
    y: height - 13,
    width: width * 0.35,
    height: 3,
    color: colors.redAccent,
  });

  let y = height - 42;

  // Header Left: Official Inxyme Logo + Company Details
  let logoOffsetX = margin;
  const logoCandidates = [
    path.join(__dirname, '../public/images/inxyme-logo.png'),
    path.join(process.cwd(), 'public/images/inxyme-logo.png'),
  ];
  const logoPath = logoCandidates.find((p) => fs.existsSync(p));
  if (logoPath) {
    try {
      const logoBytes = fs.readFileSync(logoPath);
      const logoImg = await pdfDoc.embedPng(logoBytes);
      const logoSize = 46;
      const aspect = logoImg.width / Math.max(1, logoImg.height);
      const drawW = logoSize * aspect;
      page.drawImage(logoImg, {
        x: margin,
        y: y - logoSize + 10,
        width: drawW,
        height: logoSize,
      });
      logoOffsetX = margin + drawW + 14;
    } catch (logoErr) {
      console.warn('Could not embed Inxyme logo in invoice PDF:', logoErr.message);
    }
  }

  page.drawText(safePdfText(COMPANY_INFO.name.toUpperCase()), {
    x: logoOffsetX,
    y: y - 4,
    size: 18,
    font: boldFont,
    color: colors.indigoDark,
  });
  page.drawText(safePdfText(COMPANY_INFO.tagline), {
    x: logoOffsetX,
    y: y - 19,
    size: 8.5,
    font: regularFont,
    color: colors.slate500,
  });
  page.drawText(
    safePdfText(`${COMPANY_INFO.website}  |  ${COMPANY_INFO.email}  |  ${COMPANY_INFO.phone}`),
    {
      x: logoOffsetX,
      y: y - 31,
      size: 8,
      font: regularFont,
      color: colors.slate500,
    }
  );

  const effectiveCompanyGstin = safePdfText(payment.companyGstin || COMPANY_INFO.gstin);
  if (effectiveCompanyGstin) {
    page.drawText(`GSTIN: ${effectiveCompanyGstin}`, {
      x: logoOffsetX,
      y: y - 43,
      size: 8,
      font: boldFont,
      color: colors.slate700,
    });
  }

  // Header Right: TAX INVOICE / PAYMENT RECEIPT
  const invoiceNumber = safePdfText(
    payment.invoiceNumber || `INV-${String(payment._id || '').slice(-6).toUpperCase()}`
  );
  const titleText = 'TAX INVOICE / RECEIPT';
  const titleWidth = boldFont.widthOfTextAtSize(titleText, 14);
  page.drawText(titleText, {
    x: width - margin - titleWidth,
    y: y - 4,
    size: 14,
    font: boldFont,
    color: colors.indigo,
  });

  const invText = `Invoice No: ${invoiceNumber}`;
  const invWidth = boldFont.widthOfTextAtSize(invText, 9.5);
  page.drawText(invText, {
    x: width - margin - invWidth,
    y: y - 20,
    size: 9.5,
    font: boldFont,
    color: colors.slate900,
  });

  const dateText = `Invoice Date: ${formatDateShort(payment.paymentDate || payment.createdAt)}`;
  const dateWidth = regularFont.widthOfTextAtSize(dateText, 9);
  page.drawText(dateText, {
    x: width - margin - dateWidth,
    y: y - 33,
    size: 9,
    font: regularFont,
    color: colors.slate500,
  });

  // Status badge on top right
  const statusRaw = (payment.status || 'completed').toLowerCase();
  const statusLabel = statusRaw === 'completed' ? 'PAID' : statusRaw.toUpperCase();
  const badgeStyle =
    statusRaw === 'completed'
      ? { bg: colors.greenBg, fg: colors.greenText }
      : statusRaw === 'failed' || statusRaw === 'cancelled'
      ? { bg: colors.redBg, fg: colors.redText }
      : { bg: colors.amberBg, fg: colors.amberText };

  const badgeTextW = boldFont.widthOfTextAtSize(statusLabel, 8);
  const badgeW = badgeTextW + 18;
  const badgeH = 16;
  const badgeX = width - margin - badgeW;
  const badgeY = y - 54;
  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeW,
    height: badgeH,
    color: badgeStyle.bg,
    borderColor: badgeStyle.fg,
    borderWidth: 0.75,
  });
  page.drawText(statusLabel, {
    x: badgeX + 9,
    y: badgeY + 4.5,
    size: 8,
    font: boldFont,
    color: badgeStyle.fg,
  });

  // Divider line
  y -= 68;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: colors.slate200,
  });

  // Two-column Info Cards: Billed To & Payment Details
  y -= 18;
  const colGap = 16;
  const colWidth = (contentWidth - colGap) / 2;

  const studentAddressLines = wrapTextLines(
    payment.address && payment.address !== 'Not provided' ? payment.address : 'Address not provided',
    regularFont,
    8.5,
    colWidth - 24
  ).slice(0, 3);

  const cardHeight = Math.max(114, 78 + studentAddressLines.length * 11 + (payment.studentGstin ? 13 : 0));

  // Left card: Billed To
  page.drawRectangle({
    x: margin,
    y: y - cardHeight,
    width: colWidth,
    height: cardHeight,
    color: colors.slate50,
    borderColor: colors.slate200,
    borderWidth: 0.75,
  });

  let leftY = y - 16;
  page.drawText('BILLED TO (STUDENT)', {
    x: margin + 12,
    y: leftY,
    size: 8,
    font: boldFont,
    color: colors.indigo,
  });
  leftY -= 16;
  page.drawText(safePdfText(payment.name || 'Student'), {
    x: margin + 12,
    y: leftY,
    size: 10.5,
    font: boldFont,
    color: colors.slate900,
  });
  leftY -= 14;
  page.drawText(safePdfText(`Email: ${payment.email || 'N/A'}`), {
    x: margin + 12,
    y: leftY,
    size: 8.5,
    font: regularFont,
    color: colors.slate700,
  });
  leftY -= 12;
  page.drawText(safePdfText(`Phone: ${payment.phone || 'Not provided'}`), {
    x: margin + 12,
    y: leftY,
    size: 8.5,
    font: regularFont,
    color: colors.slate700,
  });
  leftY -= 12;
  for (const addrLine of studentAddressLines) {
    page.drawText(addrLine, {
      x: margin + 12,
      y: leftY,
      size: 8.5,
      font: regularFont,
      color: colors.slate500,
    });
    leftY -= 11;
  }
  if (payment.studentGstin) {
    page.drawText(safePdfText(`Student GSTIN: ${payment.studentGstin}`), {
      x: margin + 12,
      y: leftY - 2,
      size: 8.5,
      font: boldFont,
      color: colors.slate700,
    });
  }

  // Right card: Payment Metadata
  const rightX = margin + colWidth + colGap;
  page.drawRectangle({
    x: rightX,
    y: y - cardHeight,
    width: colWidth,
    height: cardHeight,
    color: colors.slate50,
    borderColor: colors.slate200,
    borderWidth: 0.75,
  });

  let rightY = y - 16;
  page.drawText('PAYMENT DETAILS', {
    x: rightX + 12,
    y: rightY,
    size: 8,
    font: boldFont,
    color: colors.indigo,
  });
  rightY -= 16;

  const refValue =
    payment.transactionId || payment.paymentId || payment.orderId || String(payment._id || '').slice(-10).toUpperCase();
  const metaRows = [
    ['Payment Date:', formatDateShort(payment.paymentDate || payment.createdAt)],
    ['Payment Mode:', formatPaymentMethodLabel(payment.paymentMethod)],
    ['Ref / Txn ID:', refValue || 'N/A'],
    ['Purpose:', payment.installmentLabel || 'Full Course Fee'],
    [
      'Recorded Via:',
      payment.source === 'admin_manual'
        ? 'Admin Portal'
        : payment.source === 'payment_link'
        ? 'Payment Link'
        : 'Direct Checkout',
    ],
  ];

  for (const [label, val] of metaRows) {
    page.drawText(label, {
      x: rightX + 12,
      y: rightY,
      size: 8.5,
      font: regularFont,
      color: colors.slate500,
    });
    const safeVal = safePdfText(val);
    const valLines = wrapTextLines(safeVal, boldFont, 8.5, colWidth - 102);
    page.drawText(valLines[0] || 'N/A', {
      x: rightX + 94,
      y: rightY,
      size: 8.5,
      font: boldFont,
      color: colors.slate900,
    });
    rightY -= 15;
  }

  // Fee & GST Breakdown Table
  y = y - cardHeight - 24;

  const gst = computeGstBreakup(
    payment.paymentAmount,
    payment.gstRate ?? 18,
    payment.gstInclusive !== false
  );

  // Table header bar
  const tableHeaderH = 26;
  page.drawRectangle({
    x: margin,
    y: y - tableHeaderH,
    width: contentWidth,
    height: tableHeaderH,
    color: colors.indigoDark,
  });

  const cols = {
    sr: margin + 10,
    desc: margin + 36,
    taxable: margin + 258,
    cgst: margin + 336,
    sgst: margin + 398,
    total: width - margin - 10, // right-aligned
  };

  const thY = y - 16.5;
  page.drawText('#', { x: cols.sr, y: thY, size: 8.5, font: boldFont, color: colors.white });
  page.drawText('PROGRAM / FEE DESCRIPTION', {
    x: cols.desc,
    y: thY,
    size: 8.5,
    font: boldFont,
    color: colors.white,
  });
  page.drawText('TAXABLE', {
    x: cols.taxable,
    y: thY,
    size: 8.5,
    font: boldFont,
    color: colors.white,
  });
  page.drawText(`CGST ${gst.cgstRate}%`, {
    x: cols.cgst,
    y: thY,
    size: 8.5,
    font: boldFont,
    color: colors.white,
  });
  page.drawText(`SGST ${gst.sgstRate}%`, {
    x: cols.sgst,
    y: thY,
    size: 8.5,
    font: boldFont,
    color: colors.white,
  });
  const totalHdr = 'TOTAL';
  page.drawText(totalHdr, {
    x: cols.total - boldFont.widthOfTextAtSize(totalHdr, 8.5),
    y: thY,
    size: 8.5,
    font: boldFont,
    color: colors.white,
  });

  // Table body row
  y -= tableHeaderH;
  const descLines = wrapTextLines(payment.course || 'Course Enrollment Fee', boldFont, 9.5, 210);
  const subLabel = safePdfText(
    `${payment.installmentLabel || 'Course Fee'}${
      gst.gstRate > 0
        ? gst.gstInclusive
          ? ` (Inclusive of ${gst.gstRate}% GST)`
          : ` (+ ${gst.gstRate}% GST)`
        : ''
    }`
  );
  const rowHeight = Math.max(46, 28 + descLines.length * 13);

  page.drawRectangle({
    x: margin,
    y: y - rowHeight,
    width: contentWidth,
    height: rowHeight,
    color: colors.white,
    borderColor: colors.slate200,
    borderWidth: 0.75,
  });

  const rowTopY = y - 18;
  page.drawText('1', { x: cols.sr, y: rowTopY, size: 9, font: regularFont, color: colors.slate700 });

  let descY = rowTopY;
  for (const dLine of descLines) {
    page.drawText(dLine, {
      x: cols.desc,
      y: descY,
      size: 9.5,
      font: boldFont,
      color: colors.slate900,
    });
    descY -= 12.5;
  }
  page.drawText(subLabel, {
    x: cols.desc,
    y: descY,
    size: 8,
    font: regularFont,
    color: colors.slate500,
  });

  page.drawText(formatInrAscii(gst.taxableValue), {
    x: cols.taxable,
    y: rowTopY,
    size: 8.5,
    font: regularFont,
    color: colors.slate700,
  });
  page.drawText(formatInrAscii(gst.cgstAmount), {
    x: cols.cgst,
    y: rowTopY,
    size: 8.5,
    font: regularFont,
    color: colors.slate700,
  });
  page.drawText(formatInrAscii(gst.sgstAmount), {
    x: cols.sgst,
    y: rowTopY,
    size: 8.5,
    font: regularFont,
    color: colors.slate700,
  });

  const grandStr = formatInrAscii(gst.grandTotal);
  page.drawText(grandStr, {
    x: cols.total - boldFont.widthOfTextAtSize(grandStr, 9.5),
    y: rowTopY,
    size: 9.5,
    font: boldFont,
    color: colors.slate900,
  });

  // Summary Block (Right aligned) + Amount in Words (Left)
  y = y - rowHeight - 20;

  const summaryBoxW = 245;
  const summaryBoxX = width - margin - summaryBoxW;
  const summaryStartY = y;

  const summaryLines = [];
  if (Number(payment.totalCourseFee) > 0) {
    summaryLines.push({ label: 'Program Fee', value: formatInrAscii(payment.totalCourseFee) });
  }
  if (Number(payment.discountAmount) > 0) {
    summaryLines.push({ label: 'Discount Applied', value: `- ${formatInrAscii(payment.discountAmount)}` });
  }
  if (Number(payment.previouslyPaidAmount) > 0) {
    summaryLines.push({ label: 'Previously Paid', value: `- ${formatInrAscii(payment.previouslyPaidAmount)}` });
  }
  summaryLines.push({ label: 'Taxable Value', value: formatInrAscii(gst.taxableValue) });
  if (gst.gstRate > 0) {
    summaryLines.push({ label: `CGST (${gst.cgstRate}%)`, value: formatInrAscii(gst.cgstAmount) });
    summaryLines.push({ label: `SGST (${gst.sgstRate}%)`, value: formatInrAscii(gst.sgstAmount) });
  }

  let sumY = summaryStartY;
  for (const item of summaryLines) {
    page.drawText(item.label, {
      x: summaryBoxX + 8,
      y: sumY,
      size: 8.5,
      font: regularFont,
      color: colors.slate500,
    });
    const vw = regularFont.widthOfTextAtSize(item.value, 8.5);
    page.drawText(item.value, {
      x: width - margin - 8 - vw,
      y: sumY,
      size: 8.5,
      font: regularFont,
      color: colors.slate900,
    });
    sumY -= 15;
  }

  // Highlighted Grand Total Paid bar
  const paidBarH = 26;
  sumY -= 4;
  page.drawRectangle({
    x: summaryBoxX,
    y: sumY - 8,
    width: summaryBoxW,
    height: paidBarH,
    color: colors.indigoDark,
  });
  page.drawText(
    gst.gstRate > 0 && gst.gstInclusive ? 'TOTAL PAID (INCL. GST)' : 'TOTAL AMOUNT PAID',
    {
      x: summaryBoxX + 10,
      y: sumY + 1,
      size: 8.5,
      font: boldFont,
      color: colors.white,
    }
  );
  const totalPaidStr = formatInrAscii(gst.grandTotal);
  page.drawText(totalPaidStr, {
    x: width - margin - 10 - boldFont.widthOfTextAtSize(totalPaidStr, 10),
    y: sumY + 0.5,
    size: 10,
    font: boldFont,
    color: colors.white,
  });

  if (Number(payment.balanceDue) > 0) {
    sumY -= 22;
    page.drawText('Balance Remaining:', {
      x: summaryBoxX + 8,
      y: sumY,
      size: 8.5,
      font: boldFont,
      color: colors.amberText,
    });
    const balStr = formatInrAscii(payment.balanceDue);
    page.drawText(balStr, {
      x: width - margin - 8 - boldFont.widthOfTextAtSize(balStr, 9),
      y: sumY,
      size: 9,
      font: boldFont,
      color: colors.amberText,
    });
  }

  // Left side next to summary: Amount in Words + Remarks
  const leftNoteW = contentWidth - summaryBoxW - 18;
  let noteY = summaryStartY;
  page.drawText('AMOUNT IN WORDS', {
    x: margin,
    y: noteY,
    size: 8,
    font: boldFont,
    color: colors.indigo,
  });
  noteY -= 13;
  const wordLines = wrapTextLines(numberToIndianWords(gst.grandTotal), boldFont, 8.5, leftNoteW);
  for (const wLine of wordLines) {
    page.drawText(wLine, {
      x: margin,
      y: noteY,
      size: 8.5,
      font: boldFont,
      color: colors.slate900,
    });
    noteY -= 12;
  }

  if (payment.notes) {
    noteY -= 8;
    page.drawText('NOTES / REMARKS', {
      x: margin,
      y: noteY,
      size: 8,
      font: boldFont,
      color: colors.slate500,
    });
    noteY -= 12;
    const remarkLines = wrapTextLines(payment.notes, regularFont, 8, leftNoteW).slice(0, 4);
    for (const rLine of remarkLines) {
      page.drawText(rLine, {
        x: margin,
        y: noteY,
        size: 8,
        font: regularFont,
        color: colors.slate700,
      });
      noteY -= 11;
    }
  }

  // Terms & Footer Section
  const footerLineY = 122;
  page.drawLine({
    start: { x: margin, y: footerLineY },
    end: { x: width - margin, y: footerLineY },
    thickness: 0.75,
    color: colors.slate200,
  });

  page.drawText('TERMS & DECLARATION', {
    x: margin,
    y: footerLineY - 16,
    size: 8,
    font: boldFont,
    color: colors.slate700,
  });
  const terms = [
    '1. All fees quoted and collected include 18% GST unless specified otherwise.',
    '2. Registration and program fees are non-refundable once batch allocation or LMS access is granted.',
    '3. This is a computer-generated Tax Invoice & Payment Receipt and does not require a physical signature.',
  ];
  let termY = footerLineY - 29;
  for (const t of terms) {
    page.drawText(t, {
      x: margin,
      y: termY,
      size: 7.5,
      font: regularFont,
      color: colors.slate500,
    });
    termY -= 11;
  }

  const bottomBrand = safePdfText(
    `${COMPANY_INFO.name}  |  ${COMPANY_INFO.website}  |  ${COMPANY_INFO.email}`
  );
  page.drawText(bottomBrand, {
    x: margin,
    y: 34,
    size: 8,
    font: boldFont,
    color: colors.indigoDark,
  });
  const genText = `Generated on ${formatDateShort(new Date())}`;
  page.drawText(genText, {
    x: width - margin - regularFont.widthOfTextAtSize(genText, 8),
    y: 34,
    size: 8,
    font: regularFont,
    color: colors.slate500,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
};
