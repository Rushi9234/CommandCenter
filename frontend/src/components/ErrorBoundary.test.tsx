import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

const Bomb = () => {
  throw new Error('boom');
};

const Safe = () => <div>Everything is fine</div>;

describe('ErrorBoundary', () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    // React logs the caught error to the console by default (in addition
    // to componentDidCatch) -- expected noise for this test, not a
    // failure signal.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    reloadSpy = vi.fn();
    originalLocation = window.location;
    // jsdom's window.location.reload isn't implemented -- stub it so the
    // "Reload page" button's click handler doesn't throw in the test.
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload: reloadSpy },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Safe />
      </ErrorBoundary>
    );

    expect(screen.getByText('Everything is fine')).toBeInTheDocument();
  });

  it('renders the fallback UI with a clear message instead of crashing when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByText('Everything is fine')).not.toBeInTheDocument();
  });

  it('reloads the page when the reload action is clicked', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByText('Reload page'));

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
