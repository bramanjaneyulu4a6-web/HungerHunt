import { Link } from 'react-router-dom';

/* Public legal pages share one quiet reading surface. They deliberately sit
   outside the signed-in navigation: a payment provider, reviewer, or parent
   must be able to open a policy URL directly without an app session. */
export default function PolicyPage({ title, summary, children }) {
  return (
    <div className="policy-page">
      <header className="policy-header">
        <Link className="policy-brand" to="/login" aria-label="Hunger Hunt Parent login">
          <img src="/Logo.jpeg" alt="" />
          <span>Hunger Hunt Parent</span>
        </Link>
        <nav className="policy-nav" aria-label="Policy pages">
          <Link to="/terms-and-conditions">Terms</Link>
          <Link to="/privacy-policy">Privacy</Link>
          <Link to="/refund-policy">Refunds</Link>
          <Link to="/shipping-policy">Shipping</Link>
        </nav>
      </header>

      <main className="policy-document">
        <p className="policy-eyebrow">Hunger Hunt Parent policy</p>
        <h1>{title}</h1>
        <p className="policy-updated">Last updated: 7 September 2026</p>
        <p className="policy-summary">{summary}</p>
        <div className="policy-content">{children}</div>
      </main>

      <footer className="policy-footer">
        <span>HungerHunt · GRAARR MANAGEMENT SERVICES PRIVATE LIMITED</span>
        <span>120/3-M-I-S, Sainath Nagar, Revenue Ward No. 120, Kurnool, Andhra Pradesh, India - 518003</span>
      </footer>
    </div>
  );
}
