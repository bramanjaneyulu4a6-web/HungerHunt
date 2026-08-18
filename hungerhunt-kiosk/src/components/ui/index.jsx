/* Shared UI primitives, styled by ui.css.
   Prefer these over another page-local `styles` object — the point is that a
   change to a button or card lands everywhere at once. Each accepts className
   and passes the rest through, so a one-off tweak stays possible. */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../Icon';

const cx = (...parts) => parts.filter(Boolean).join(' ');

export function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </header>
  );
}

export function Card({ as: Tag = 'div', className, children, ...rest }) {
  return (
    <Tag className={cx('card', className)} {...rest}>
      {children}
    </Tag>
  );
}

/* Renders as <button>, or as a router <Link> when `to` is given, so navigation
   that looks like a button is still a real link. */
export function Button({
  variant = 'primary',
  block = false,
  to,
  className,
  children,
  ...rest
}) {
  const classes = cx('btn', `btn--${variant}`, block && 'btn--block', className);

  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

export function Badge({ variant = 'neutral', className, children, ...rest }) {
  return (
    <span className={cx('badge', `badge--${variant}`, className)} {...rest}>
      {children}
    </span>
  );
}

export function Banner({ variant = 'warn', icon, className, children, ...rest }) {
  return (
    <div
      className={cx('banner', `banner--${variant}`, className)}
      role={variant === 'alert' ? 'alert' : 'status'}
      {...rest}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </div>
  );
}

/* Shell shared by login, register, forgot-password and reset-password.

   `logo` and `eyebrow` are both optional, and stay that way deliberately.
   Each app chooses whether its front door is branded; hardcoding either here
   would require every frontend to ship the same asset and presentation. */
export function AuthLayout({ logo, eyebrow, title, subtitle, children, footer }) {
  return (
    <div className="auth-page">
      <div className="auth-ambient auth-ambient--one" aria-hidden="true" />
      <div className="auth-ambient auth-ambient--two" aria-hidden="true" />
      <div className="auth-card">
        <header className="auth-header">
          {logo && <img className="auth-logo" src={logo} alt="" />}
          {eyebrow && <p className="auth-eyebrow">{eyebrow}</p>}
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        </header>

        {children}

        {footer && <p className="auth-footer">{footer}</p>}
      </div>
    </div>
  );
}

/* `id` is required rather than optional: the old markup used bare <label>
   elements with no htmlFor, so nothing tied a label to its input. */
export function AuthField({ id, label, aside, ...inputProps }) {
  return (
    <div className="auth-field">
      {aside ? (
        <div className="auth-label-row">
          {/* Balances the aside so the label stays optically centred. */}
          <span style={{ width: 20 }} aria-hidden="true" />
          <label className="auth-label" htmlFor={id}>
            {label}
          </label>
          {aside}
        </div>
      ) : (
        <label className="auth-label" htmlFor={id}>
          {label}
        </label>
      )}

      <input id={id} className="auth-input" {...inputProps} />
    </div>
  );
}

export function PasswordField({ id, label, aside, ...inputProps }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-field">
      <div className="auth-label-row">
        <label className="auth-label" htmlFor={id}>{label}</label>
        {aside}
      </div>
      <div className="password-input-wrap">
        <input
          id={id}
          className="auth-input"
          type={visible ? 'text' : 'password'}
          {...inputProps}
        />
        <button
          type="button"
          className="password-reveal"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={19} />
        </button>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action, variant = 'default', className, ...rest }) {
  return (
    <div className={cx('empty-state', variant !== 'default' && `empty-state--${variant}`, className)} {...rest}>
      {icon && (
        <span className="empty-state__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <p className="empty-state__title">{title}</p>
      {children && <p className="empty-state__body">{children}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 16, radius, style, ...rest }) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
      {...rest}
    />
  );
}

/* Wrap repeated items to stagger their entrance. */
export function AnimateIn({ index = 0, as: Tag = 'div', className, style, children, ...rest }) {
  return (
    <Tag
      className={cx('anim-in', className)}
      style={{ '--i': index, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
