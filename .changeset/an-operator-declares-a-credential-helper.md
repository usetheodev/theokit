---
'@theokit/agents': minor
---

An operator can declare `apiKeyHelper` — a command that prints a credential — in the operator policy,
and `resolveOperatorApiKey` from `@theokit/agents/auth` runs it.

Measured before (B-069): `apiKeyHelper`, `awsAuthRefresh`, `gcpAuthRefresh` and `otelHeadersHelper`
all returned zero occurrences against a control of 31 on the word `hooks`. An agent holding a token
that rotates failed mid-run, and the only answer was to restart the process with a fresh environment
variable.

It is an OPERATOR declaration, not a `defineAgent` argument, per the decision B-065 recorded: the
person answerable for what runs on a machine is frequently not the person who wrote the code, and a
command that mints a secret is the most operator-shaped thing in the system.

Three refusals are part of the contract, each pinned by a test:

- **A helper that hangs** is killed at 10 s (configurable) and fails with a typed error naming the
  command. A credential helper runs before every request that needs the key; "the agent is slow" is
  the hardest symptom to trace back to a line in a policy file.
- **A helper that prints nothing** fails rather than returning `''`, which would surface later as a
  401 whose message says nothing about the helper.
- **The output never reaches the error text.** A failure is read from logs, issue trackers and
  screenshots. `stderr` is not even named as a callback parameter.

`runCredentialHelper` — which takes an arbitrary command string — is deliberately NOT exported.
Offering it publicly would hand a caller the choice of what to execute, the exact decision the
operator tier exists to take away from them.

`awsAuthRefresh`, `gcpAuthRefresh` and `otelHeadersHelper` are still absent, and the module says so
rather than leaving silence: the first two refresh an ambient cloud session instead of returning a
value, and the third supplies headers for a telemetry exporter this layer does not own.
