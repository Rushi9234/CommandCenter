# COMMANDCENTER ENGINEERING CHARTER (READ CAREFULLY)

From this point onward, every implementation in this repository must follow these architectural rules.

## PRIMARY GOAL

Build an enterprise-grade backend architecture while keeping the active implementation completely FREE.

The project must demonstrate industry-level software engineering, but the currently active stack must never require paid plans, automatic billing, or hidden costs.

The repository should always be ready for an easy upgrade to enterprise providers later.

====================================================
1. FREE-FIRST POLICY
====================================================

The default implementation must always use free solutions.

Never introduce an active dependency that:

- requires a paid subscription
- automatically bills after a free quota
- requires a credit card when an equivalent free option exists
- introduces vendor lock-in

If a paid provider is mentioned, implement only the abstraction/interface unless explicitly instructed otherwise.

====================================================
2. ENTERPRISE-READY POLICY
====================================================

Every infrastructure component must be replaceable.

Business logic must NEVER directly depend on:

- Redis
- AWS
- SendGrid
- Pino
- OpenTelemetry
- Sentry
- Cloudflare
- Azure
- GCP
- Groq
- OpenAI
- Claude
- or any vendor.

Always introduce interfaces/adapters/factories.

Correct architecture:

Business Logic
↓
Interface
↓
Factory
↓
Provider Implementation

====================================================
3. CONFIGURATION DRIVEN
====================================================

Provider switching must happen through configuration.

Example:

LOGGER=console

later

LOGGER=pino

NOT through code modifications.

====================================================
4. NO DUPLICATED BUSINESS LOGIC
====================================================

Never create:

AuthServiceFree

AuthServiceEnterprise

Only one business service may exist.

Only provider implementations may differ.

====================================================
5. CLEAN ARCHITECTURE
====================================================

Continue following repository/service/controller layering.

Do not bypass repositories.

Do not place SQL inside services.

Do not place business logic inside controllers.

====================================================
6. BACKWARD COMPATIBILITY
====================================================

Unless explicitly approved:

- no API contract changes
- no frontend breaking changes
- no schema redesign
- no behavior changes

====================================================
7. PROVIDER ISOLATION
====================================================

Future providers should be added by creating a new implementation only.

Example:

ConsoleLogger

PinoLogger

SentryLogger

All implementing Logger interface.

====================================================
8. DOCUMENTATION
====================================================

Every new infrastructure abstraction must include documentation explaining:

- why it exists
- current free implementation
- future enterprise implementation
- migration path

====================================================
9. IMPLEMENTATION STYLE
====================================================

Prefer:

small commits

small milestones

reversible changes

zero regression

high test coverage

====================================================
10. BEFORE MODIFYING CODE
====================================================

Always ask:

"Can this be implemented through an abstraction instead of coupling to a provider?"

If yes,

choose the abstraction.

====================================================
11. IMPORTANT
====================================================

Never rewrite working code just for architectural beauty.

Only refactor when:

- it improves maintainability
- enables future enterprise providers
- reduces coupling
- keeps current behavior identical

====================================================
12. OUTPUT FORMAT
====================================================

For every milestone provide:

1. Architecture review
2. Files changed
3. Why each file changed
4. Testing performed
5. Remaining risks
6. Rollback strategy


## 13. PROVIDER ABSTRACTION

Every external service must have:

- Interface
- Free implementation
- Enterprise implementation (may be a stub initially)
- Factory/Resolver
- Configuration-based provider selection

The application must never know which provider is active.

Changing providers should require only configuration changes and, at most, implementing a new provider class—not modifying business logic.


Do not start another milestone automatically.

Wait for approval after every milestone.