import { useEffect, useRef, useState } from 'react';
import { formatINR } from '../utils/format';
import { normalizeVpa, vpaProblem } from '../utils/demoUpi';

/* Paying to an address the parent types, rather than to an app we can name.
   Shared by both checkouts — the order sheet and the wallet top-up — so the
   wording, the validation and the reassurance are the same wherever a parent
   meets this.

   The address is checked here only to answer while they are still on the
   screen; the server checks the same shape again before it spends a gateway
   call. Complaints clear as soon as they start correcting, because a message
   that stays put while the text under it changes reads as broken rather than
   as help. */
export default function UpiIdForm({ amount, busy, onBack, onSubmit }) {
  const [value, setValue] = useState('');
  const [problem, setProblem] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const complaint = vpaProblem(value);
    setProblem(complaint);
    if (!complaint) onSubmit(normalizeVpa(value));
  };

  return (
    <form className="upi-id-form" onSubmit={submit} noValidate>
      <label htmlFor="upi-id-input">Your UPI ID</label>
      <input
        ref={inputRef}
        id="upi-id-input"
        className={`upi-id-input${problem ? ' upi-id-input--invalid' : ''}`}
        type="text"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          if (problem) setProblem('');
        }}
        placeholder="name@bank"
        // A UPI ID is shaped like an email and is never a sentence: the
        // keyboard should offer '@', and nothing should capitalise or
        // "correct" what the parent types.
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck="false"
        enterKeyHint="go"
        disabled={busy}
        aria-invalid={problem ? 'true' : undefined}
        aria-describedby={problem ? 'upi-id-problem' : 'upi-id-hint'}
      />

      {problem ? (
        <p id="upi-id-problem" className="upi-id-problem" role="alert">
          {problem}
        </p>
      ) : (
        <p id="upi-id-hint" className="upi-id-hint">
          We&apos;ll send a payment request to this UPI ID. Open your UPI app and approve it
          to pay.
        </p>
      )}

      <button type="submit" className="upi-demo-pay" disabled={busy}>
        Request {formatINR(amount)}
      </button>
      <button type="button" className="upi-id-back" onClick={onBack} disabled={busy}>
        Choose another way to pay
      </button>
    </form>
  );
}
