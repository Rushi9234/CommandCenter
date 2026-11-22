# Email Provider Abstraction

## Why this exists

Before Milestone 15, `emailService.ts`'s three functions
(`sendVerificationEmail`, `sendPasswordResetEmail`, `sendTeamInviteEmail`)
were themselves the "sending" implementation — a `console.log`/`getLogger()`
stub with no real delivery, and no interface separating "what to send"
from "how to send it." The [Engineering Charter](../../../../../docs/architecture/ENGINEERING_CHARTER.md)
requires every external-service dependency (SendGrid and AWS SES are both
named explicitly) to sit behind an interface *before* a paid provider is
ever added — this milestone puts that boundary in place while the app
still has zero real email delivery, so the eventual switch to a real
provider is a config change, not a rewrite.

## Current free implementation

`EMAIL_PROVIDER=console` (the default if unset) selects
`ConsoleEmailProvider`, which delivers nothing and logs (via Milestone
14's `Logger` abstraction) that a send was attempted. It deliberately
**never logs `message.body` or `message.templateData`** — those are where
a verification/reset URL (and the raw token inside it) live, and
Milestone 11 fixed a real leak of exactly that value into logs. Only
`to`, `subject`, and the caller-supplied `metadata` (which `emailService.ts`
only ever populates with already-safe fields — recipient name, team name,
inviter name, the non-secret team-invite link) are logged.

Free, no dependencies, no external account, no cost — identical operating
cost to what was already running.

## Future enterprise migration path

Adding `SendGridEmailProvider` or `SESProvider` (not implemented in this
milestone) means writing one new class implementing `EmailProvider`'s
single `send(message: EmailMessage): Promise<boolean>` method, using
`message.to`/`message.subject`/`message.body`/`message.templateData` to
actually call that provider's API, and adding one `case` branch in
`emailProviderFactory.ts`. `emailService.ts` does not change.

## How provider switching works

```
EMAIL_PROVIDER=console    # current free default
EMAIL_PROVIDER=sendgrid   # future -- not implemented yet
EMAIL_PROVIDER=ses        # future -- not implemented yet
```

An unrecognized value falls back to `ConsoleEmailProvider` rather than
failing every auth/team-invite email flow closed.
