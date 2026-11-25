import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import EmailRecord from '../model/EmailRecord.js';
import { sendEmail } from './email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const EMAIL_LOGO_PATH = path.join(__dirname, '..', 'public', 'images', 'inxyme-logo.png');

/**
 * Send a branded transactional email with the inline Inxyme CID logo (if present on disk)
 * and log delivery/failure into EmailRecord.
 */
export const sendBrandedEmailWithRecord = async ({
  to,
  cc = '',
  buildContent,
  studentName = '',
  courseName = '',
  templateUsed,
  adminUserId,
  extraAttachments = [],
  recordAttachments = [],
}) => {
  const hasLogo = fs.existsSync(EMAIL_LOGO_PATH);
  const emailContent = buildContent(hasLogo);

  const mailAttachments = [...extraAttachments];
  if (hasLogo) {
    mailAttachments.push({
      filename: 'inxyme-logo.png',
      path: EMAIL_LOGO_PATH,
      cid: 'inxyme-logo',
    });
  }

  let emailStatus = 'sent';
  let emailError = null;

  try {
    await sendEmail({
      to,
      cc: cc ? String(cc).trim() : '',
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
      attachments: mailAttachments,
    });
  } catch (sendErr) {
    emailStatus = 'failed';
    emailError = sendErr.message;
    throw sendErr;
  } finally {
    try {
      await EmailRecord.create({
        to,
        subject: emailContent.subject,
        message: emailContent.html,
        studentName,
        courseName,
        templateUsed,
        attachments: recordAttachments,
        status: emailStatus,
        error: emailError,
        sentBy: adminUserId,
        sentAt: new Date(),
      });
    } catch (recordErr) {
      console.warn(`Could not save EmailRecord for ${templateUsed}:`, recordErr.message);
    }
  }

  return emailContent;
};
