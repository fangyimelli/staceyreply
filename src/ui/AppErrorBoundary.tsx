import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string;
  eventId: string;
  occurredAt: string;
}

const createEventId = () =>
  `err-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    componentStack: '',
    eventId: createEventId(),
    occurredAt: new Date().toISOString(),
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      error,
      eventId: createEventId(),
      occurredAt: new Date().toISOString(),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack || '' });
    console.error('Unhandled render error in Stacey Reply Replay.', error, info);
  }

  private reloadPage = () => {
    window.location.reload();
  };

  render() {
    const { error, componentStack, eventId, occurredAt } = this.state;
    if (!error) return this.props.children;

    const detailText = componentStack.trim() || error.message || 'No component stack was provided.';

    return (
      <main className="error-boundary-shell" role="alert" aria-live="assertive">
        <section className="error-boundary-card">
          <div className="error-boundary-pill">Render error captured</div>
          <h1>Something went wrong while rendering this replay.</h1>
          <p>
            The app hit a render-time exception and paused on this fallback screen instead of
            unmounting the whole SPA.
          </p>

          <section className="error-boundary-section">
            <h2>What you can do</h2>
            <ul>
              <li>Reload the page to restart the current replay state.</li>
              <li>Switch to a different pair if this crash is tied to one replay dataset.</li>
              <li>Use the sample case again if the current replay dataset looks malformed.</li>
            </ul>
            <div className="error-boundary-actions">
              <button type="button" onClick={this.reloadPage}>Reload page</button>
            </div>
          </section>

          <section className="error-boundary-section">
            <h2>Error details</h2>
            <pre className="error-boundary-pre">{detailText}</pre>
          </section>

          <section className="error-boundary-section">
            <h2>Diagnostics</h2>
            <dl className="error-boundary-diagnostics">
              <div><dt>Event</dt><dd>{eventId}</dd></div>
              <div><dt>Time</dt><dd>{occurredAt}</dd></div>
              <div><dt>Name</dt><dd>{error.name || 'Error'}</dd></div>
              <div><dt>Message</dt><dd>{error.message || 'n/a'}</dd></div>
              <div><dt>Route</dt><dd>{window.location.href}</dd></div>
              <div><dt>User agent</dt><dd>{navigator.userAgent}</dd></div>
            </dl>
          </section>
        </section>
      </main>
    );
  }
}
