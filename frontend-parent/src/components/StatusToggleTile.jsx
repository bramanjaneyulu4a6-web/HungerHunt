import { tick } from '../utils/haptics';

/* A full-width card that IS the switch. Tapping anywhere on it flips the
   boolean: the card presses into the page when ON and sits raised above it
   when OFF, so "on" reads as "this button is depressed / engaged".

   Three things carry the state at once — the elevation, the accent tint and
   the word. That redundancy is deliberate: the press-in alone is too subtle on
   some screens, and colour alone fails for colour-blind readers. */

export default function StatusToggleTile({
  label,
  value,
  onTap,
  description,
  activeDescription,
  inactiveDescription,
  activeLabel = 'On',
  inactiveLabel = 'Off',
  activeIcon,
  inactiveIcon,
  disabled = false,
}) {
  // If only the active description is given it stands for both states.
  const copy = value
    ? (activeDescription ?? description)
    : (inactiveDescription ?? activeDescription ?? description);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={disabled}
      className={`status-toggle${value ? ' status-toggle--on' : ''}`}
      onClick={async () => {
        await tick();
        onTap();
      }}
    >
      <span className="status-toggle__chip" aria-hidden="true">
        {value ? activeIcon : inactiveIcon}
      </span>

      <span className="status-toggle__text">
        <strong className="status-toggle__label">{label}</strong>
        {copy && <span className="status-toggle__copy">{copy}</span>}
      </span>

      {/* Fixed width: letting this size itself reflows the description mid
          animation when the word changes length. */}
      <span className="status-toggle__state" aria-hidden="true">
        {value ? activeLabel : inactiveLabel}
      </span>
    </button>
  );
}

// The controlled-field shape, for callers that hold a boolean rather than a
// toggle handler.
export function ToggleSwitchField({ value, onChange, ...props }) {
  return <StatusToggleTile {...props} value={value} onTap={() => onChange(!value)} />;
}
