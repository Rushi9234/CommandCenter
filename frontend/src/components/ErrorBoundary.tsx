import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// Milestone 19: React's own class-component error-boundary API
// (getDerivedStateFromError/componentDidCatch) is the only mechanism this
// uses -- no Sentry, no external monitoring, no retry framework, no toast
// system. This catches exceptions thrown during rendering anywhere in its
// child tree (a bad prop, an unexpected API response shape, a null
// dereference) that nothing else in the app currently catches --
// services/api.ts's axios interceptor only handles network/API errors,
// not render-time exceptions. Without this, any such error unmounts the
// whole React tree and leaves a blank white screen with no way to
// recover short of a manual page reload.
//
// console.error is deliberately the only logging here -- no frontend
// Logger abstraction is being introduced for this.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
          <div className="pro-card p-8 shadow-xl w-full max-w-md text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Something went wrong</h1>
            <p className="alert alert-error mb-6 text-sm">
              An unexpected error occurred and this part of the app couldn't continue. Reloading the page usually fixes this.
            </p>
            <button onClick={this.handleReload} className="btn-primary w-full">
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
