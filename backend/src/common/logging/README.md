# Logger Provider Abstraction

## Why this exists

Before Milestone 14, `errorHandler.ts`, `auth.service.ts`, `emailService.ts`,
and `server.ts` all called `console.log`/`console.warn`/`console.error`
directly. That's not a vendor coupling problem the way Milestone 13's
direct Groq calls were (`console` costs nothing and needs no account),
but the [Engineering Charter](../../../../docs/architecture/ENGINEERING_CHARTER.md)
uses exactly this case (`LOGGER=console` → `LOGGER=pino`) as its own
illustrative example of the pattern every infrastructure dependency should
follow. Introducing the abstraction now — before more logging call sites
accumulate — avoids vendor lock-in to "always `console`, called directly,
everywhere" the same way Milestone 13 avoided lock-in to Groq.

This directory puts one interface (`Logger`) between application code and
whichever concrete implementation is active. No call site imports
`ConsoleLogger` (or any future provider) directly — everything goes
through `getLogger()`.

## Current free implementation

`LOGGER=console` (the default if unset) selects `ConsoleLogger`, which
writes one structured JSON object per call to stdout (`console.log` for
`info`, `console.warn` for `warn`, `console.error` for `error` — the same
severity-to-stream mapping direct `console.*` calls already had):

```json
{
  "timestamp": "2026-01-01T00:00:00.000Z",
  "level": "warn",
  "message": "Failed login attempt",
  "context": {
    "event": "auth.failed_login",
    "reason": "invalid_password",
    "email": "someone@example.com"
  }
}
```

Free, no dependencies, no external account — identical operating cost to
what was already running.

## Future enterprise implementation

`PinoLogger`/`SentryLogger` (not implemented in this milestone) would each
implement the same `Logger` interface. Switching which one is active is a
config change:

```
LOGGER=console   # current free default
LOGGER=pino      # future -- not implemented yet
LOGGER=sentry    # future -- not implemented yet
```

## Migration path

1. Implement the new provider class in this directory (e.g.
   `pinoLogger.ts`), implementing `Logger`'s three methods
   (`info`/`warn`/`error`, each `(message: string, context?: LogContext)`).
2. Add a `case` for it in `loggerFactory.ts`.
3. Set `LOGGER=pino` (or whatever the new provider's key is) in the
   environment.
4. No change to `errorHandler.ts`, `auth.service.ts`, `emailService.ts`,
   `server.ts`, or anywhere else that calls `getLogger()` — the interface
   and call sites are unaffected.
