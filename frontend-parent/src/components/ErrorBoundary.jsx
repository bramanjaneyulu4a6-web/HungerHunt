import { Component } from 'react';
import { Button, EmptyState } from './ui';

/* Catching a render error needs a class component — there is still no hook
   equivalent. Without one, React unmounts the whole tree on any uncaught
   error: in a browser tab that is a blank page the reader can refresh, but
   inside the Capacitor shell there is no address bar, so it is an app that
   stays white until it is force-quit and reopened. */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Nothing collects these yet, so the console is where a crash reported
    // from a test device can still be read over a cable.
    console.error('Unhandled render error:', error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="page">
        <EmptyState
          icon="⚠️"
          title="Something went wrong"
          action={
            /* Reload rather than clearing the flag: whatever state led to the
               error is still in memory, so re-rendering the same tree would
               most likely fail the same way. */
            <Button onClick={() => window.location.reload()}>
              Reload the app
            </Button>
          }
        >
          The app ran into an unexpected problem. Reloading usually fixes it —
          your account and balances are not affected.
        </EmptyState>
      </div>
    );
  }
}
