# `@theokit/agents`

The layer between `@theokit/sdk` and an application that hosts an agent.

The SDK is the **runtime** — it calls the model, dispatches tools, stores the conversation, streams
the response. This package is the **home**: the surfaces an app needs around that runtime — where
credentials come from, which tools are in scope and under what sandbox, when a human is asked, what
happens to a session after it ends.

The division is not stylistic. `@theokit/agents` never re-implements a runtime concern; when it
looks like it does, that is a bug. What it does is **enrich**: adding the object-shaped surface where
there is state or orchestration to hold, and forwarding the rest unchanged.

> **Enriching never reduces.** A symbol the SDK exposes and this layer does not forward is
> unreachable to whoever consumes the layer — and the only legal way out for them is to reimplement
> it. That happened: when `./auth` exported one value against the SDK's nineteen, a downstream
> product rewrote ~120 lines of credential mechanics in the
> repository root now requires a written decision per SDK symbol, so the next gap breaks CI instead
> of quietly costing someone a week.

## Install

```bash
pnpm add @theokit/agents
```

Peer dependencies: `zod` (schemas), `react` (only for `./client/react`), `@theokit/http` (only when
you mount HTTP surfaces).

## Subpath map

Twenty entry points. Import the one you need — the barrel is not the API.

| Subpath | What lives there |
|---|---|
| `.` | `AgentBuilder.create()` — the authoring surface — plus the error hierarchy and shared types |
| `./bridge` | The SDK seam — `createSdkAgentStream`, event translation, the agent builder internals |
| `./testing` | Test seams: compiled-agent inspection, mock streams |
| `./sandbox` | Sandbox backends, postures, `sandboxWritePolicy` |
| `./persistence` | Transcript storage primitives forwarded from the SDK |
| `./interactive` | The interactive-shell backend contract |
| `./pty` | The node-pty implementation of that contract |
| `./auth` | Credential store, OAuth/device flow, `resolveCredential`, `assertSecureModes` |
| `./config` | Agent configuration, trust posture, and the instruction tree (`loadInstructionTree`) |
| `./tools` | Built-in tool factories (read, list, grep, git, patch, edit, shell, …) |
| `./client` | Transports for driving an agent from a client |
| `./client/react` | `useAgent` and the React bindings |
| `./session` | Session lifecycle, listing, fork/rewind, transcript GC with a retention floor |
| `./hooks` | The lifecycle-hook engine and its fingerprint gate |
| `./ask` | The human-in-the-loop rendezvous — ask a question, settle it, abandon it safely |
| `./tool-scope` | `bindToolScope` — bind `{projectRoot, writeRoot, sandbox}` once so an unconfined shell is unrepresentable |
| `./mcp-health` | MCP server health probing |
| `./commands` | Command routing and the shutdown/cleanup contract |
| `./doctor` | Environment diagnostics |
| `./usage` | Token and cost accounting |

## The shapes worth knowing before you start

**Tool scope is bound once, not per tool.** `bindToolScope({ projectRoot, writeRoot, sandbox })`
returns a binder; every factory it binds inherits the scope. `sandbox` is **required** — a scope
without one would be an unconfined shell, and making it unrepresentable is cheaper than detecting it.

**Human gates come in three layers, and they compose.** You *declare* which tools need approval on
the builder, the *posture* decides whether auto-approval is even permissible (it carries the sandbox
posture as evidence, so "auto-approve without confinement" cannot be expressed), and the *resolver*
settles an individual request. `./ask` is the inverse channel — the agent asking you.

**Sessions are deleted carefully or not at all.** `./session` refuses to collect a transcript that a
live writer holds, floors both `keepLast` and `maxAgeDays`, and plans before it applies. When your
app knows about live sessions this package cannot see, inject them — protection is additive and
never subtractive.

**Credentials answer two questions.** Which credential to use, and where it came from. The second
matters more than it looks: without provenance, "why is it calling Anthropic?" has no answer in the
data, and a user cannot tell an explicit choice from a precedence fallback.

## What changed recently

See [`CHANGELOG.md`](./CHANGELOG.md) — shipped inside this package, so `node_modules` answers the
question without a round trip to the repository.

For "which symbol delivers capability X, and in which version did it land", the CHANGELOG entry that
shipped the symbol is the answer — every entry names the version it landed in.

## Foreign configuration surfaces

Which `.claude/` surfaces this package reads, and which it refuses. A surface is **read, or refused
with a reason** — never accepted and ignored, which is the failure an author cannot tell apart from
configuration that had no effect.

| Surface | State |
|---|---|
| `CLAUDE.md` | read |
| `settings.json` — `permissions` | translated into the SDK's `PermissionRule[]`; an entry that cannot be rendered faithfully is reported and excluded |
| `settings.json` — `env`, `outputStyle` | read |
| `settings.local.json` | read, layered above `settings.json` |
| `skills/`, `agents/`, `commands/`, `plugins/` | read when the dialect is declared |
| `.mcp.json` | read; a field this runtime does not carry is reported |
| `output-styles/*.md` | read, selected by `settings.json` |
| `agent-memory/` | read — see below |
| `workflows/*.js` | **refused**, and reported. Every other surface is data; a workflow is code, and executing JavaScript found under a caller-supplied directory is a decision that belongs to you |
| `keybindings.json` | **out of scope** — `@theokit/tui` |
| `themes/*.json` | **out of scope** — `@theokit/tui` |
| `~/.claude.json` — OAuth state, UI toggles | **out of scope** — a CLI's own state |
| `~/.claude.json` — personal-scope MCP servers | **not read yet**, and in scope |


### Out of scope, and who owns it instead

An absence that reads as an oversight gets re-investigated at full cost by the next person. These
were measured on 2026-09-12 — `keybindings`, `themes/` and `.claude.json` each return **0 files**
across every package source tree, against a control of 31 for `skills` — and each one is a decision
rather than a gap.

**`keybindings.json` and `themes/*.json` belong to `@theokit/tui`.** A framework has no keyboard and
no colour: it produces text and tool calls, and the process that renders them owns which key does
what and which escape codes it emits. Reading them here would let this package hold configuration it
cannot act on, which is the accepted-and-ignored failure the table above exists to prevent.

**`~/.claude.json` is two things under one name, and the split is the point.** Its OAuth state and UI
toggles are a CLI's own state — that file is written by a specific program about its own session, and
a library reading another program's login state would be reaching into something it neither owns nor
can refresh. Its **personal-scope MCP servers** are a different matter: an MCP server the operator
registered for themselves is a framework concern, this package already reads project-scope servers
from `.mcp.json`, and the personal scope measures 0. That half is **not refused — it is not done**,
and saying so is the distinction this section exists to make.

The registry entry that prompted this counts four decisions across three files, because
`~/.claude.json` is split. That is the count, stated so nobody goes looking for a fourth file.

### `agent-memory/`

A subagent whose frontmatter declares `memory:` gets a directory it reads and writes. The first
**200 lines, capped at 25KB**, of its `MEMORY.md` are loaded when it runs — both caps apply, and
truncation is reported rather than silent.

| `memory:` | Root | Who can see it |
|---|---|---|
| `project` | `<cwd>/.claude/agent-memory/<agent>/` | committed, shared with the team |
| `local` | `<cwd>/.claude/agent-memory-local/<agent>/` | kept out of version control |
| `user` | `~/.claude/agent-memory/<agent>/` | crosses projects |

```ts
import { resolveAgentMemory } from '@theokit/agents/config'

const { root, memory, truncated } = resolveAgentMemory({ agent: 'auditor', scope: 'project', cwd })
```

An unrecognised scope is **refused**, not defaulted. The three differ in exactly one way — who can
see the notes — so guessing `project` would publish, on the next commit, something written expecting
privacy. A subagent name that would escape the root is refused for the same reason: it comes from a
file that arrives with the repository.

This is distinct from the session auto-memory at `~/.claude/projects/`: each subagent reads and
writes its own `MEMORY.md`, not the operator's.

## Boundaries this package keeps

- It does **not** call an LLM provider, run a tool-dispatch loop, or own the conversation store.
  Those are the SDK's, and a PR that adds one here is rejected on sight.
- It does **not** depend on the `theokit` web framework. The dependency runs the other way.
- Web Standards over Node APIs inside `src/` — `Request`/`Response`, `fetch`, `crypto.randomUUID`.
  Node APIs live in adapters.

## Who decides policy

**An operator who did not write the code can impose policy on it.** That is a decision, recorded
here because it is the one a team evaluating this framework for deployment needs before anything
else.

It was not always true. Hooks, MCP servers, permissions and skill execution were each a value the
*programmer* passed at build time — a constructor argument, decided in code, by whoever wrote the
agent. That is a defensible design for a framework and an indefensible one for anything an
organisation deploys: it means the person responsible for what an agent may do on a machine has no
way to say so.

Policy is read from disk, and the layers have a fixed precedence:

| Layer | Who writes it | Wins against |
|---|---|---|
| `managed-settings.json` | the operator / the organisation | everything below |
| `.claude/settings.json`, `.theokit/settings.json` | the project | the code |
| `defineAgent({ … })` | the programmer | nothing |

A programmer can still decide everything, and in a single-author project nothing above them exists.
What changed is that they are no longer the *only* one who can.

Two consequences worth stating, because they are the cost:

- A value declared in code can be **overridden by a file the programmer does not control**. That is
  the point, and it means a build-time guarantee is not one.
- An operator restriction is refused loudly rather than silently narrowed. A policy that quietly
  did less than it said would be worse than none — the failure this repository keeps finding under
  other names.

## Licence

See `LICENSE`.
