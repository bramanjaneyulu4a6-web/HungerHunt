import { walletControlStates } from '../utils/walletControls';

/* Two small marks under a student's wallet balance: who approves orders (a
   person for the parent, the same person with a superscript C for the room
   caretaker; green when on) and the
   spending limit (yellow-orange when on). Gray when off. Hover (or a screen
   reader) gives the setting in words. See utils/walletControls.js.

   Drawn here rather than added to components/Icon.jsx, which must stay
   identical across all four apps (scripts/check-shared-files.mjs) and is only
   ever needed by this one table. */

const GLYPHS = {
  // A person: the parent answers the order.
  parent: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  // The parent's person, shifted left, with a superscript C: the room's
  // caretaker answers on the parent's behalf.
  caretaker: <>
    <circle cx="9" cy="9.5" r="3.5" />
    <path d="M2.5 21a6.5 6.5 0 0 1 13 0" />
    <path d="M22 3.6a3.2 3.2 0 1 0 0 4.8" />
  </>,
  // A gauge: spending is capped.
  limit: <><path d="M3 18a9 9 0 1 1 18 0" /><path d="m12 18 4.5-6" /></>,
};

export default function WalletControlIcons({ student }) {
  return (
    <span className="wallet-controls">
      {walletControlStates(student).map(({ key, glyph, tone, on, label }) => (
        <span
          key={key}
          className={`wallet-controls__mark${on ? ` wallet-controls__mark--${tone}` : ''}`}
          title={label}
          role="img"
          aria-label={label}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {GLYPHS[glyph]}
          </svg>
        </span>
      ))}
    </span>
  );
}
