import nodemailer from "nodemailer";

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
}

export const sendMail = async ({ to, subject, html }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Email is not configured on the server");
  }

  return getTransporter().sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    html,
  });
};

export const sendPasswordResetMail = async ({ to, resetUrl }) => {
  return sendMail({
    to,
    subject: "HungerHunt — Password Reset",
    html: `
      <p>We received a request to reset your HungerHunt password.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in 10 minutes. If you did not request it, you can ignore this email.</p>
    `,
  });
};
