import '@testing-library/jest-dom';

// Milestone 18: wires @testing-library/jest-dom's matchers
// (toBeInTheDocument, toHaveTextContent, etc.) into every test file via
// vite.config.ts's `test.setupFiles`. Nothing else lives here yet --
// this is the one place future global test setup (mocks, polyfills)
// would go if it's ever needed.
