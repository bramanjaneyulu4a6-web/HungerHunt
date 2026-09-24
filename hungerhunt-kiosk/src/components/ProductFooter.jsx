import { useEffect, useRef, useState } from 'react';

export default function ProductFooter() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    document.body.style.overflow = 'hidden';
    dialog?.querySelector('button')?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll('button, a[href]')];
      const first = focusable[0];
      const last = focusable.at(-1);

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <footer className="product-footer">
        <span>A product of GRAARR Management Services Pvt. Ltd.</span>
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
          Contact Us
        </button>
      </footer>

      {open && (
        <div className="product-contact-backdrop" onClick={() => setOpen(false)}>
          <section
            ref={dialogRef}
            className="product-contact-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-contact-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="product-contact-close"
              aria-label="Close contact information"
              onClick={() => setOpen(false)}
            >
              &times;
            </button>
            <p className="product-contact-eyebrow">Contact Us</p>
            <h2 id="product-contact-title">Anand Kamma</h2>
            <p className="product-contact-role">HungerHunt – Head of Operations</p>
            <address>
              <a href="tel:+916304519244">
                <span className="product-contact-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z" />
                  </svg>
                </span>
                <span>6304519244</span>
              </a>
              <a href="mailto:dev.kamma04@gmail.com">
                <span className="product-contact-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                </span>
                <span>dev.kamma04@gmail.com</span>
              </a>
            </address>
          </section>
        </div>
      )}
    </>
  );
}
