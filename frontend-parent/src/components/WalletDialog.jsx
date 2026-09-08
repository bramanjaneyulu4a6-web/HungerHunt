import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

/* The shell the wallet's two actions open into. It holds no flow of its own:
   the top-up form and the spending limit keep their state on the page they
   came from, so opening them in a dialog changed where they are read, not how
   they work. Portaled to <body> like every other sheet, so no ancestor's
   transform or filter can reach it. */
export default function WalletDialog({
  title,
  eyebrow,
  description,
  busy = false,
  onClose,
  /* Extra header controls, drawn beside the close button — the receipt's
     download icon rides here. Close always stays the outermost control. */
  actions = null,
  children,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // The first control rather than the field: on a phone, opening straight
    // into a text input throws the keyboard over the sheet before the parent
    // has read what it is for.
    dialogRef.current?.querySelector('button, input, select')?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  return createPortal(
    <div
      className="wallet-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="wallet-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-dialog-title"
      >
        <header className="wallet-dialog__head">
          <div>
            {eyebrow && <span className="payment-choice-eyebrow">{eyebrow}</span>}
            <h2 id="wallet-dialog-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {actions}
            <button
              type="button"
              className="review-modal__close"
              onClick={onClose}
              disabled={busy}
              aria-label={`Close ${title.toLowerCase()}`}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </header>

        {children}
      </section>
    </div>,
    document.body
  );
}
