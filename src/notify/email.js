import nodemailer from 'nodemailer';
import { markdownToBasicHtml } from '../render.js';

export async function sendEmail({ subject, markdown, env }) {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    EMAIL_FROM,
    EMAIL_TO,
  } = env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !EMAIL_TO) {
    throw new Error('Email 必填欄位缺漏，檢查 .env (SMTP_HOST/USER/PASS/EMAIL_TO)');
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 465),
    secure: String(SMTP_SECURE ?? 'true') === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const html = markdownToBasicHtml(markdown);
  const info = await transporter.sendMail({
    from: EMAIL_FROM || SMTP_USER,
    to: EMAIL_TO,
    subject,
    text: markdown,
    html,
  });
  return info.messageId;
}
