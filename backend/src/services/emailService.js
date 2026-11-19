const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  if (!env.smtp.host || !env.smtp.from) return null;

  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    ...(env.smtp.user && env.smtp.pass
      ? { auth: { user: env.smtp.user, pass: env.smtp.pass } }
      : {}),
  });

  return transporter;
}

async function sendVerificationEmail({ to, token }) {
  const smtp = getTransporter();
  if (!smtp) {
    logger.warn('Verification email not sent because SMTP is not configured');
    return false;
  }

  const frontendUrl = env.frontendUrl.replace(/\/+$/, '');
  const verificationUrl = `${frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
  await smtp.sendMail({
    from: env.smtp.from,
    to,
    subject: 'Verify your NectarTrace email',
    text: `Verify your NectarTrace email by opening this link: ${verificationUrl}`,
  });
  logger.info('Verification email sent');
  return true;
}

module.exports = { sendVerificationEmail };
