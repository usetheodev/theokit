# Migration guides

This directory holds version-to-version upgrade guides for TheoKit. Each
guide is the canonical source linked from runtime warnings emitted in the
previous version.

| From | To | Guide |
|---|---|---|
| 0.2.x | 0.3.0 | [0.2-to-0.3.md](./0.2-to-0.3.md) |

## How runtime warnings link here

Starting in 0.2.0, structured warnings (e.g. `csrf.warn`) include a
`code` and a `docsUrl` field. Each `docsUrl` resolves to an anchor in
one of the guides above:

| `code` | `docsUrl` | Anchor in guide |
|---|---|---|
| `CSRF_STRICT_CUTOVER` | `https://theokit.dev/upgrade/csrf-strict-cutover` | [0.2-to-0.3.md#csrf-strict-cutover](./0.2-to-0.3.md#csrf-strict-cutover) |

The `https://theokit.dev/upgrade/...` URL ships with 0.4.0. Until then,
read the markdown source directly from this directory or via GitHub.

## How to find which warnings will fire on YOUR app

Run the upgrade-readiness scanner before bumping:

```bash
npx theokit check --upgrade-readiness 0.3
```

It walks `app/`, `server/`, and `public/`, reporting every file:line that
will break under the new defaults, plus a suggested fix per violation.
