# Execution and deployment boundaries

The Next.js server never executes learner Python or R. Browser-only demo execution uses a dedicated worker, a cached runtime per language, a fresh evaluation namespace for each run, a 60-second loading timeout, a 10-second execution timeout, cancellation through worker termination, and 32 KiB displayed output limits. Server execution cards display an unsupported message. Reset restores authored starter code. Runtime downloads can fail offline; the runner reports the error and allows retry.

Python uses Pyodide 0.27.2. R uses WebR 0.4.2 with its PostMessage worker transport and captures console streams and conditions. See the upstream [Pyodide stream APIs](https://pyodide.org/en/stable/usage/streams.html) and [WebR capture examples](https://docs.r-wasm.org/webr/v0.4.2/examples.html).

Workers prevent ordinary infinite loops from blocking the UI, but are **not a security sandbox**. Browser code can access JavaScript/network capabilities available to its origin. Do not run untrusted lesson or learner code while signed into a privileged shared-origin production session. A separate execution origin with restrictive capabilities and a dedicated sandbox service is required before deploying untrusted execution. Browser/WASM memory may grow before termination; no reliable per-run hard memory quota is claimed. WebR captures output internally before the display cap is applied.

Author automated-check scripts run after code in authenticated editor/preview and report pass/fail with assertion messages. The public projection omits check scripts and solutions, so public exercises do not run hidden checks. Delivering a secret script to a browser would reveal it; secure learner grading remains a sandbox integration task. MCQ answers are client-visible demo feedback. Tutor configuration is stored and editable, but there is no connected LLM tutor service. Runtime-path resources are metadata/links and are not automatically mounted. Plots and arbitrary runtime package installation are not implemented.

# Identity and authorization

Only admin and staff roles receive CMS access. Every server action and authenticated API checks identity and course access. Admins create/manage structure, assignments and publication; staff edit assigned drafts only. Tokens are generated with cryptographic randomness, rotated on login and revoked on logout. Shared identity lookup uses `auth_sessions.user_id`, and expired tokens do not authenticate. The password adapter validates PBKDF2 parameters and uses timing-safe comparison. Shared profiles are never seeded by CMS commands.

HTML is skipped by Markdown rendering; resource/figure URLs are restricted to HTTP(S). Mutating APIs reject foreign origins; only the public GET API supports configured CORS. Public projections omit private author source and review configuration. Published revisions have separate normalized detail rows from drafts.

# Remaining production follow-ups

- Verify the actual provisioned shared schema, password format, SSO plan, permissions and TLS. Disposable PostgreSQL tests do not substitute for that deployment check.
- Isolate execution onto a dedicated origin/sandbox and implement secure hidden learner grading, hard resource limits, shared lesson runtime state and resource mounting.
- Add deployment-specific login rate limiting, operational audit logs, monitoring, retention and backup restore rehearsals.
- Expand browser coverage to cross-browser assistive technology and real mobile devices. Current tests cover Chromium and programmatic responsive behavior.
- Add revision/history browsing UI and complete cross-browser assistive-technology validation.

The sample is a manually importable reference. The original Python Launchpad source/content load is deferred at the user’s request; no YAML migration is included. The legacy TeachCode learner application still needs its own integration change.
