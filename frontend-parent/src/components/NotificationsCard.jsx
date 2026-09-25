import { useEffect, useState } from 'react';
import { Button, Card } from './ui';
import { enablePush, pushStatus } from '../utils/push';
import './NotificationsCard.css';

const HIDE_KEY = 'notificationsCardHiddenUntil';
const HIDE_FOR_MS = 3 * 24 * 60 * 60 * 1000;

const hiddenForNow = () => {
  try {
    return Number(localStorage.getItem(HIDE_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
};

const hideForAWhile = () => {
  try {
    localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_FOR_MS));
  } catch {
    // Private mode: the card simply comes back next visit.
  }
};

const COPY = {
  off: {
    title: 'Turn on notifications',
    body: 'Get told the moment your child asks to buy something, so orders are not left waiting for your approval.',
  },
  on: {
    title: 'Notifications could not be set up',
    body: 'Notifications are allowed, but this device could not be registered for them.',
  },
  blocked: {
    title: 'Notifications are blocked',
    body: 'You turned notifications off for Hunger Hunt. To get approval requests, allow notifications for this site or app in your phone or browser settings, then come back here.',
  },
  'in-app': {
    title: 'Open in your browser to get notifications',
    body: 'This page is open inside another app (such as WhatsApp), which cannot show notifications. Tap ⋮ or the share icon, choose “Open in Chrome” or “Open in Safari”, sign in, and turn notifications on there.',
  },
  'ios-install': {
    title: 'Add Hunger Hunt to your Home Screen',
    body: 'On iPhone, notifications only work once the site is on your Home Screen. In Safari, tap the Share icon, choose “Add to Home Screen”, open Hunger Hunt from there, and turn notifications on.',
  },
  browser: {
    title: 'This browser cannot show notifications',
    body: 'Open Hunger Hunt in Chrome (Android or computer) or install the Hunger Hunt app to get approval requests as notifications.',
  },
};

export default function NotificationsCard() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState(hiddenForNow);

  useEffect(() => {
    let ignore = false;
    const check = () => pushStatus().then((next) => { if (!ignore) setStatus(next); });

    check();
    // Coming back from the settings app is how a blocked parent unblocks.
    window.addEventListener('focus', check);
    return () => {
      ignore = true;
      window.removeEventListener('focus', check);
    };
  }, []);

  if (!status || hidden) return null;
  // Permission alone is not enough: hide this only after the backend has the
  // token for the parent who is signed in on this device.
  if (status.state === 'on' && status.registered && !failed) return null;

  const key = status.state === 'unsupported' ? status.reason : status.state;
  const copy = COPY[key] || COPY.browser;

  const enable = async () => {
    setBusy(true);
    setFailed(false);
    const registered = await enablePush();
    const next = await pushStatus();
    setBusy(false);
    setStatus(next);
    if ((!registered || !next.registered) && next.state === 'on') setFailed(true);
  };

  const dismiss = () => {
    hideForAWhile();
    setHidden(true);
  };

  return (
    <Card className="notifications-card" role="region" aria-labelledby="notifications-card-title">
      <div className="notifications-card__body">
        <span className="notifications-card__icon" aria-hidden="true">🔔</span>
        <div>
          <h2 className="notifications-card__title" id="notifications-card-title">{copy.title}</h2>
          <p className="notifications-card__copy">{copy.body}</p>
          {failed && (
            <p className="notifications-card__error" role="alert">
              Check your connection and try again. In a private or incognito window, open Hunger Hunt in a normal window instead.
            </p>
          )}
        </div>
      </div>
      <div className="notifications-card__actions">
        {status.state === 'off' && (
          <Button onClick={enable} disabled={busy}>
            {busy ? 'Turning on…' : 'Turn on notifications'}
          </Button>
        )}
        {(failed || (status.state === 'on' && !status.registered)) && (
          <Button onClick={enable} disabled={busy}>Try again</Button>
        )}
        <Button variant="ghost" onClick={dismiss}>Not now</Button>
      </div>
    </Card>
  );
}
