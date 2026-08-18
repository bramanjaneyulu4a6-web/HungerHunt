import { Button } from '../ui';
import { formatINR } from '../../utils/format';

const cx = (...parts) => parts.filter(Boolean).join(' ');

function ErrorVisual({ presentation }) {
  return (
    <span className={cx('error-visual', `error-visual--${presentation}`)} aria-hidden="true">
      <i className="error-visual__main" />
      <i className="error-visual__accent" />
      <i className="error-visual__accent error-visual__accent--two" />
    </span>
  );
}

export function BalanceMeter({ available, required, label = 'Wallet balance' }) {
  const safeAvailable = Math.max(0, Number(available) || 0);
  const safeRequired = Math.max(0, Number(required) || 0);
  const shortfall = Math.max(0, safeRequired - safeAvailable);
  const progress = safeRequired > 0 ? Math.min(100, (safeAvailable / safeRequired) * 100) : 100;
  return (
    <div className="balance-meter" aria-label={`${label}: ${formatINR(safeAvailable)} available, ${formatINR(safeRequired)} needed`}>
      <div className="balance-meter__values">
        <span><small>Available</small><strong>{formatINR(safeAvailable)}</strong></span>
        <span><small>Needed</small><strong>{formatINR(safeRequired)}</strong></span>
      </div>
      <div className="balance-meter__track" aria-hidden="true"><i style={{ '--balance-progress': `${progress}%` }} /></div>
      {shortfall > 0 && <strong className="balance-meter__short">{formatINR(shortfall)} short</strong>}
    </div>
  );
}

export function LimitMeter({ used = 0, pending = 0, limit, period = 'purchase' }) {
  const safeLimit = Math.max(1, Number(limit) || 1);
  const safeUsed = Math.max(0, Number(used) || 0);
  const safePending = Math.max(0, Number(pending) || 0);
  return (
    <div className="limit-meter" aria-label={`${safeUsed} purchased, ${safePending} awaiting approval, ${safeLimit} ${period} limit`}>
      <div className="limit-meter__dots" aria-hidden="true">
        {Array.from({ length: Math.min(safeLimit, 8) }, (_, index) => <i key={index} className={index < safeUsed ? 'is-used' : index < safeUsed + safePending ? 'is-pending' : ''} />)}
        <i className="limit-meter__attempt" />
      </div>
      <div className="limit-meter__legend"><span>{safeUsed} purchased</span>{safePending > 0 && <span>{safePending} awaiting approval</span>}<strong>{safeLimit} / {safeLimit} {period}</strong></div>
    </div>
  );
}

export function StockMeter({ available = 0, requested }) {
  const shown = Math.min(Math.max(Number(requested) || Number(available) || 1, 1), 8);
  const safeAvailable = Math.max(0, Number(available) || 0);
  return (
    <div className="stock-meter" aria-label={`${safeAvailable} available${requested ? `, ${requested} requested` : ''}`}>
      {Array.from({ length: shown }, (_, index) => <i key={index} className={index >= safeAvailable ? 'is-empty' : ''} />)}
      <strong>Only {safeAvailable} left</strong>
    </div>
  );
}

export function ErrorFeedback({ issue, level = 'card', action, available, required, children, className, id }) {
  if (!issue) return null;
  const role = issue.presentation === 'validation' ? 'alert' : 'status';
  return (
    <section id={id} className={cx('error-feedback', `error-feedback--${issue.presentation}`, `error-feedback--${level}`, className)} role={role} aria-live={role === 'alert' ? 'assertive' : 'polite'}>
      <ErrorVisual presentation={issue.presentation} />
      <div className="error-feedback__copy">
        {issue.stamp && <span className="error-status-stamp">{issue.stamp}</span>}
        <h2>{issue.title}</h2>
        <p>{issue.message}</p>
        {available !== undefined && required !== undefined && <BalanceMeter available={available} required={required} />}
        {children}
        {action && <Button variant="ghost" onClick={action.onClick}>{action.label || 'Try again'}</Button>}
      </div>
    </section>
  );
}

export function InlineFieldError({ id, children }) {
  if (!children) return null;
  return <p className="inline-field-error" id={id} role="alert">{children}</p>;
}
