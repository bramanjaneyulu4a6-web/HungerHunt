import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import API from '../services/api';
import { Button } from './ui';
import Icon from './Icon';
import { ErrorFeedback } from './error/ErrorFeedback';
import { presentError } from '../utils/errorPresentation';
import {
  SIMULATION_DEFAULTS,
  SIMULATION_STEPS,
  completedSteps,
  routeDurationMs,
  simulationPhase,
} from '../utils/warehouseSimulation';

/* The PhonePe test account's stand-in for the storeroom and the dorm.
 *
 * Opens from an order card that the server has marked as simulatable — which
 * it only does for the test parent's own packages — and does two things at
 * once when the button is pressed: asks the server to walk the package to
 * delivered, and plays the route so the reviewer sees what a real package
 * goes through. The delivered screen waits for both; see
 * utils/warehouseSimulation for why.
 *
 * Nothing here decides the package moved. The server's reply does, and the
 * card behind this dialog is refreshed from the server once it closes. */

const TICK_MS = 80;

export default function WarehouseSimulationDialog({ order, onClose, onSimulated }) {
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [reply, setReply] = useState(null);
  const dialogRef = useRef(null);
  const titleId = `sim-title-${order.id}`;

  const phase = started ? simulationPhase({ elapsedMs: elapsed, reply }) : 'intro';
  const busy = phase === 'running' || phase === 'settling';

  const done = completedSteps(elapsed);
  const progress = Math.min(1, elapsed / routeDurationMs());

  // The clock behind the route. Stops on its own once the last step has lit.
  useEffect(() => {
    if (!started) return undefined;
    const startedAt = performance.now();
    const timer = setInterval(() => {
      const now = performance.now() - startedAt;
      setElapsed(now);
      if (now >= routeDurationMs()) clearInterval(timer);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [started]);

  const start = async () => {
    setReply(null);
    setElapsed(0);
    setStarted(true);
    try {
      const res = await API.post(`/parent/packages/${order.id}/simulate-warehouse`);
      setReply({ ok: true, package: res.data?.package });
    } catch (err) {
      setReply({
        error: presentError({
          request: !err.response,
          message:
            err.response?.data?.message ||
            "Couldn't reach the server. Check your connection and try again.",
        }),
      });
    }
  };

  const finish = () => {
    onSimulated?.();
    onClose();
  };

  const close = () => {
    if (busy) return;
    if (phase === 'delivered') onSimulated?.();
    onClose();
  };

  // Escape reads the latest close (it depends on phase) without re-binding
  // the listener every tick of the clock.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusable = () =>
      [...dialog.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')]
        .filter((element) => !element.disabled);

    focusable()[0]?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const currentStep = SIMULATION_STEPS[Math.min(done, SIMULATION_STEPS.length - 1)];

  return createPortal(
    <div
      className="sim-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        className={`sim-modal sim-modal--${phase}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="sim-modal__head">
          <div>
            <p className="section-eyebrow">PhonePe test account · order #{String(order.id).slice(-6).toUpperCase()}</p>
            <h2 id={titleId}>
              {phase === 'delivered' ? 'Delivered' : 'The warehouse takes over from here'}
            </h2>
            <p>
              {phase === 'intro' &&
                'Your payment is done. From this point a real order is moved by the storeroom, the caretaker and your child — this account can stand in for all three.'}
              {busy && `${currentStep.actor} · ${currentStep.detail}`}
              {phase === 'delivered' && 'Every warehouse and caretaker step was recorded on this order, marked as simulated.'}
              {phase === 'failed' && 'The warehouse could not be simulated for this order.'}
            </p>
          </div>
          <button
            type="button"
            className="sim-modal__close"
            aria-label="Close"
            disabled={busy}
            onClick={close}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="sim-modal__body">
          {phase === 'intro' ? (
            <>
              <ol className="sim-steps" aria-label="What the warehouse does">
                {SIMULATION_STEPS.map((step, index) => (
                  <li key={step.status} className="sim-step">
                    <span className="sim-step__mark" aria-hidden="true">
                      <Icon name={step.icon} size={20} />
                    </span>
                    <div>
                      <span className="sim-step__actor">{index + 1} · {step.actor}</span>
                      <strong>{step.title}</strong>
                      <p>{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="sim-defaults">
                <h3>Filled in for you</h3>
                <p>
                  Steps that normally need someone to type are completed with
                  placeholder details, so nothing will be asked of you.
                </p>
                <dl>
                  <div><dt>Receiver at the room</dt><dd>{SIMULATION_DEFAULTS.receivedBy}</dd></div>
                  <div><dt>Receiver phone</dt><dd className="ledger-mono">{SIMULATION_DEFAULTS.receiverPhone}</dd></div>
                  <div><dt>Purchase code</dt><dd>{SIMULATION_DEFAULTS.purchaseCode}</dd></div>
                </dl>
              </div>
            </>
          ) : (
            <div className="sim-route" aria-live="polite">
              <div className="sim-route__track" style={{ '--progress': progress }}>
                <i className="sim-route__line" aria-hidden="true" />
                <i className="sim-route__fill" aria-hidden="true" />
                <span className="sim-route__parcel" aria-hidden="true">
                  <Icon name={done >= SIMULATION_STEPS.length ? 'check' : 'package'} size={18} />
                </span>
                <ol className="sim-route__nodes">
                  {SIMULATION_STEPS.map((step, index) => {
                    const reached = index < done;
                    const active = index === done && busy;
                    return (
                      <li
                        key={step.status}
                        className={`sim-node${reached ? ' sim-node--reached' : ''}${active ? ' sim-node--active' : ''}`}
                        aria-current={active ? 'step' : undefined}
                      >
                        <span className="sim-node__dot" aria-hidden="true">
                          {reached ? <Icon name="check" size={14} /> : <Icon name={step.icon} size={14} />}
                        </span>
                        <small>{step.title}</small>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {phase === 'delivered' && (
                <div className="sim-done">
                  <span className="sim-done__mark" aria-hidden="true">
                    <Icon name="check" size={30} />
                    {[0, 1, 2, 3, 4, 5].map((dot) => <i key={dot} style={{ '--dot': dot }} />)}
                  </span>
                  <strong>Package delivered</strong>
                  <p>
                    Handed to {SIMULATION_DEFAULTS.receivedBy} and collected by {order.studentName || 'the student'}.
                    The order card now shows it as delivered.
                  </p>
                </div>
              )}

              {phase === 'settling' && (
                <p className="sim-route__wait">Waiting for the server to confirm…</p>
              )}

              {phase === 'failed' && (
                <ErrorFeedback
                  issue={reply.error}
                  action={{ label: 'Try again', onClick: start }}
                />
              )}
            </div>
          )}
        </div>

        <footer className="sim-modal__actions">
          {phase === 'intro' && (
            <>
              <Button variant="ghost" onClick={onClose}>Not now</Button>
              <Button variant="dark" onClick={start}>
                <Icon name="truck" size={18} /> Simulate the warehouse process
              </Button>
            </>
          )}
          {busy && (
            <span className="sim-modal__status">
              {currentStep.title}…
            </span>
          )}
          {phase === 'delivered' && (
            <Button variant="dark" onClick={finish}>Done</Button>
          )}
          {phase === 'failed' && (
            <Button variant="ghost" onClick={onClose}>Close</Button>
          )}
        </footer>
      </section>
    </div>,
    document.body
  );
}
