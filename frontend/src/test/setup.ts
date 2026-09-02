import '@testing-library/jest-dom';

// Milestone 18: wires @testing-library/jest-dom's matchers
// (toBeInTheDocument, toHaveTextContent, etc.) into every test file via
// vite.config.ts's `test.setupFiles`. Nothing else lives here yet --
// this is the one place future global test setup (mocks, polyfills)
// would go if it's ever needed.

// Notification deep-linking: jsdom does not implement Element.
// scrollIntoView at all -- Goals.tsx/Projects.tsx's deep-link scroll
// effects call it on a real DOM element, which would otherwise throw
// "scrollIntoView is not a function" in every test, not just ones that
// exercise the deep-link path. A no-op stub is sufficient; no test
// asserts real scroll positioning, only that it's called.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
