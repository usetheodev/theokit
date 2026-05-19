# Security Policy

Thanks for taking the time to help keep TheoKit secure.

## Reporting a Vulnerability

**Use the GitHub Private Security Advisory channel first.** It is the
canonical disclosure mechanism for TheoKit and works without any DNS or
mailserver setup on our side.

Open a new advisory at:

  https://github.com/usetheodev/theokit/security/advisories/new

We aim to acknowledge advisories within 72 hours. After triage, you
will receive:

1. Confirmation of receipt
2. An assessment of severity and impact
3. A target date for a fixed release
4. Credit in the published advisory (unless you prefer to remain
   anonymous)

### Secondary channel — email

If GitHub is unreachable for you, email `security@usetheo.dev`.

> **Note:** The `security@usetheo.dev` mailbox MAY not be monitored if
> MX records have not yet been configured for this domain. **Prefer the
> GitHub Private Security Advisory channel above** — it works
> immediately and never goes silent. If you email and receive no
> acknowledgment within 5 business days, open a private advisory.

## Do Not

- Open a public GitHub issue for a security vulnerability. Doing so
  exposes the issue to attackers before users can update.
- Demonstrate the vulnerability on third-party systems or user data
  that you do not own.
- Disclose the vulnerability publicly until a fix has shipped and users
  have had a reasonable window (typically 30 days) to upgrade.

## Supported Versions

We support the latest minor on the `latest` dist-tag plus the previous
minor on the `legacy` dist-tag.

| Version | Supported |
|---|---|
| 0.3.x (current `latest`) | Yes — security fixes shipped immediately |
| 0.2.x (current `legacy`) | Yes — security fixes for 6 months from 0.3.0 release |
| < 0.2.0                  | No |

When a new minor ships, the previous `legacy` tier is retired and
replaced.

## Scope

In scope:

- `packages/theo/**` — the framework runtime
- `packages/create-theo/**` — the scaffolding CLI
- The official `templates/**` shipped with `npm create theokit`

Out of scope:

- User-authored applications (your `app/`, `server/`, `theo.config.ts`)
- Third-party plugins (those have their own maintainers)
- Issues that require attacker control of the developer's local
  machine (we cannot patch the developer's threat model)

## Coordinated Disclosure

For vulnerabilities affecting multiple frameworks or with broad
ecosystem impact, we coordinate with the affected vendors and (where
applicable) the GitHub Security Lab before disclosure.
