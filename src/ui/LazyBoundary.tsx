/**
 * Lazily loaded parts behind an error boundary. A chunk that 404s after a redeploy, or never arrives
 * offline, makes import() reject; without a boundary React 19 unmounts the whole root and the page
 * goes blank. With one, only that part is replaced by a short message and a reload button.
 */
import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { inlineShown, reportLoadFailure, useLoadFailure } from '../state/loadFailure';

const reload = () => window.location.reload();

/** The message in place of a part that did not load. */
export function LoadFailed() {
  useEffect(() => {
    inlineShown(1);
    return () => inlineShown(-1);
  }, []);
  return (
    <div className="load-failed" role="alert">
      <p>This part didn’t load. Reload the page.</p>
      <button className="btn small" onClick={reload}>
        Reload
      </button>
    </div>
  );
}

/** The page-wide notice, for parts with nowhere to show a message (the 3D view, whole panels). */
export function LoadNotice() {
  const wanted = useLoadFailure();
  if (!wanted) return null;
  return (
    <div className="load-notice" role="alert">
      <p>Part of albe didn’t load. Reload the page.</p>
      <button className="btn small" onClick={reload}>
        Reload
      </button>
    </div>
  );
}

interface Props {
  children: ReactNode;
  /** Show nothing in place and report to the page-wide notice (inside the 3D canvas, or a whole panel). */
  quiet?: boolean;
}

export class LoadBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    if (this.props.quiet) reportLoadFailure();
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return this.props.quiet ? null : <LoadFailed />;
  }
}

/** Suspense for a lazy part, inside a LoadBoundary. */
export function Lazy({ children, fallback = null, quiet }: Props & { fallback?: ReactNode }) {
  return (
    <LoadBoundary quiet={quiet}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </LoadBoundary>
  );
}
