import nodemailer from "nodemailer";

let transporter;

function getTransporter() {
  if (!transporter) {
    // Spelled out rather than `service: "gmail"` so the two settings that
    // matter here can be stated. `family: 4` pins the lookup to IPv4: a host
    // whose IPv6 route to smtp.gmail.com blackholes does not fail fast, it
    // hangs until the send times out, and the resulting error names nothing
    // useful. Forcing IPv4 costs nothing where IPv6 works. `minVersion` keeps
    // a downgrade from being negotiated on our behalf.
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      family: 4,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        minVersion: "TLSv1.2",
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
