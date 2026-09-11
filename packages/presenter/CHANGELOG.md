# @theokit/presenter

## 0.9.0

### Minor Changes

- cfe7f4c: **`@theokit/sdk@5.x` is now supported, alongside 4.x**
  ([#654](https://github.com/usetheokit/theokit/issues/654)).

  The declared range becomes `^4.52.1 || ^5.0.0` (`^4.49.0 || ^5.0.0` for `@theokit/presenter`), and
  the full suite passes on both halves: 7533 tests against `4.52.1` and 7533 against `5.0.1`.

  This unblocks plugins whose open-ended `@theokit/sdk` peer resolves to 5.x. Until now `theokit` was
  the package that **refused** that resolution — the ERESOLVE named the plugin, but the bound that
  could not be satisfied was this one.

  **What had to change, and why it was not a version bump.** SDK 5.x writes a transcript to
  `${sessionUuidFor(sessionId)}.jsonl` where 4.x wrote `${safeSessionId(sessionId)}.jsonl` — a
  SHA-256 over a namespace, so the filename stopped being the session id and the mapping does not
  invert. `listSessions` derived ids from filenames, so listing, protection, GC and deletion all
  returned UUIDs where callers passed ids. One defect, twenty-nine failing tests.

  The id is now read from the transcript **record**, which the SDK writes on both majors and which is
  authoritative where the name was only a convention. The filename stem remains the fallback, so a
  truncated transcript still appears in a listing rather than dropping out of GC's sight.

  `LiveTranscriptError` — 5.x's new name for `LiveSessionError` — deliberately does not cross the
  `@theokit/agents` layer: it does not exist on the 4.x half, and 5.x keeps the old name working and
  deprecated, so the name that crosses is the one both majors have.

## 0.9.0-next.0

### Minor Changes

- cfe7f4c: **`@theokit/sdk@5.x` is now supported, alongside 4.x**
  ([#654](https://github.com/usetheokit/theokit/issues/654)).

  The declared range becomes `^4.52.1 || ^5.0.0` (`^4.49.0 || ^5.0.0` for `@theokit/presenter`), and
  the full suite passes on both halves: 7533 tests against `4.52.1` and 7533 against `5.0.1`.

  This unblocks plugins whose open-ended `@theokit/sdk` peer resolves to 5.x. Until now `theokit` was
  the package that **refused** that resolution — the ERESOLVE named the plugin, but the bound that
  could not be satisfied was this one.

  **What had to change, and why it was not a version bump.** SDK 5.x writes a transcript to
  `${sessionUuidFor(sessionId)}.jsonl` where 4.x wrote `${safeSessionId(sessionId)}.jsonl` — a
  SHA-256 over a namespace, so the filename stopped being the session id and the mapping does not
  invert. `listSessions` derived ids from filenames, so listing, protection, GC and deletion all
  returned UUIDs where callers passed ids. One defect, twenty-nine failing tests.

  The id is now read from the transcript **record**, which the SDK writes on both majors and which is
  authoritative where the name was only a convention. The filename stem remains the fallback, so a
  truncated transcript still appears in a listing rather than dropping out of GC's sight.

  `LiveTranscriptError` — 5.x's new name for `LiveSessionError` — deliberately does not cross the
  `@theokit/agents` layer: it does not exist on the 4.x half, and 5.x keeps the old name working and
  deprecated, so the name that crosses is the one both majors have.

## 0.8.0

### Minor Changes

- bbdfc15: The server's raw error text no longer reaches the browser by default.

  Every failure the framework reported to a browser carried the server's own words: a tool handler's
  stderr verbatim in `tool-output-error.errorText`, a run failure's message verbatim in
  `error.errorText` — whatever a driver, an HTTP client or a filesystem call put in the exception.
  `ai@7`, speaking the same UIMessage protocol, masks by default and says why in its own comment:
  "prevent leaking server error details to the client by default". There was no equivalent here, and
  no seam to add one.

  Both are masked now, through one `onError` hook on the serving boundary
  (`streamAgentUIMessages`, `streamAgentTurnInProcess`, and `mountAgent` by pass-through), defaulting
  to a fixed string. The full text is not lost: it still reaches the server's logs and the
  `agent.run` span, and the hook receives it — what stops is it reaching a browser unless the host
  decides otherwise.

  **A tool's error text masks by the same default as a run's**, which the report that raised this
  deliberately left open. The deciding fact is that masking costs the model nothing: the presenter is
  downstream of the SDK loop, observing events the model has already consumed, so the copy being
  masked is the browser's and only the browser's. Two different defaults for "server text reaching a
  browser" would be a rule nobody could hold.

  The failure `code` keeps travelling on its own data part, so consumers still distinguish failures
  without matching on text — masking that removed the discriminator would push them back into the
  habit that part exists to have removed.

  **Breaking** for `@theokit/agents`: an application that read the server's message out of
  `errorText` now reads `'An error occurred.'`. Pass `onError: (e) => e.message` to restore the old
  behaviour explicitly, which is the point — it becomes a decision instead of a default.

### Patch Changes

- 4411a59: A web application can now render a human-in-the-loop approval prompt. `useAgent` returns
  `pendingApprovals` — one entry per decision the run is parked on, carrying the `approvalId` that
  `approve()` takes, the gated tool's name, the arguments it is about to run with, the question
  declared on the gate, and the window before it settles itself.

  Before this the hook exposed the settle half of the gate and no way to reach the other half. The
  store dropped the `tool-approval-request` frame on the way in, so its whole snapshot while a human
  was deciding was `messages`, `thread`, `status: 'streaming'` and `error` — and the paused tool sat in
  `state: 'input-available'`, which is exactly what an ungated tool looks like while it runs. An
  application could not tell "working" from "waiting for you", and could not have named the decision if
  it could. The only path left was polling `GET /api/agents/<name>/approvals` out of band.

  The transcript carries it too: the gated call's own part moves to `state: 'approval-requested'` with
  the id under `approval.id` while the decision is outstanding, and leaves that state when it is
  settled. That is the ai-sdk reader's own vocabulary, not a new one — the differential oracle compares
  the two readers on the paused run and the denied run and they reconstruct identically.

  What the gate is asking travels as a transient `data-approval` part rather than on the approval frame
  itself. The frame is shared vocabulary and `ai`'s validator for it is strict: a `question` added
  there would not give an ai-sdk client a poorer prompt, it would delete the whole approval frame for
  that client and re-create this defect on the other side of the wire. The tool's name and its
  resolved input are not repeated anywhere — the `tool-input-available` frame already announces both
  under the same call id, and both readers fold the frames into one part.

  `approve(approvalId, decision)` is unchanged; what changes is that the store now hands the id over.
  A tool with no gate produces exactly the same frames and exactly the same snapshot as before, with
  `pendingApprovals` empty.

## 0.7.0

### Minor Changes

- ed9197d: M67 — the config/trust/wiring family crosses the layered boundary, and the `@theokit/sdk` floor rises
  to `^4.49.0` to make that possible.

  **Installation-contract change.** `theokit` and `@theokit/presenter` publish `@theokit/sdk` as a
  `peerDependency`; raising the floor means a consumer pinned below 4.49.0 will now fail peer
  resolution. Sized as a minor rather than a major because the change is additive at the API level —
  nothing is removed or renamed — but the peer floor is a real break at install time and is called out
  explicitly here rather than left for the consumer to discover.

  Six values (`foldLayers`, `verifyLayerOrdering`, `applySecurityFloor`, `resolveTrustPosture`,
  `auditEnvReachability`, `recordWiring`) and two types (`WiredEntity`, `ToolResultContentBlock`) now
  cross `@theokit/agents`. Four more arrived with the floor: `classifySessionArtifact` +
  `SessionArtifact`, `atomicWriteTempTarget`, `writableRootsFor`, `assertSecureModes`.

## 0.5.0

### Minor Changes

- a6dd4c1: O piso de `@theokit/sdk` passa a ser o mesmo em todo o monorepo — `^4.40.0` (#183).

  Três pacotes declaravam o mesmo requisito de três formas: `@theokit/agents` exigia `^4.40.0` como
  dependência direta, `theokit` aceitava `^4.0.1` no peer, e `@theokit/presenter` aceitava `>=3.5.0` —
  uma major inteira abaixo.

  Um app que **honrasse o peer** e instalasse, digamos, `@theokit/sdk@4.5.0` satisfazia `theokit` e não
  satisfazia o `agents`, então o resolvedor instalava uma **segunda cópia**. Duas cópias produzem dois
  tipos nominalmente idênticos e estruturalmente incompatíveis, com a mensagem mais confusa do
  ecossistema:

  ```
  SandboxBackend is not assignable to SandboxBackend
  ```

  Isso já custou uma sessão de debug a um consumidor.

  **Nenhuma configuração que funciona hoje quebra.** Quem já está em `>= 4.40.0` não é afetado; quem
  está abaixo já recebia a cópia dupla — a mudança troca uma falha confusa de tipo por um erro claro
  de instalação. O que a declaração permitia e não funcionava, ela deixa de permitir.

## 0.4.0

### Minor Changes

- O TheoKit passa a ser dono do wire `UIMessageStream`: instalar `theokit` não traz mais o `ai`.

  Schema, parser e reconstrutor vivem em `@theokit/presenter/wire`. **O formato da frame não muda** —
  um cliente ai-sdk continua conversando com um servidor TheoKit, e nenhum app existente precisa
  migrar. `ai` deixa de ser `peerDependency`; quem o declarava só por causa do TheoKit pode removê-lo.

  Por que **minor** e não major: nada que um consumidor faz deixa de funcionar. Remover um peer é
  relaxamento, não quebra; os tipos são estruturalmente compatíveis (medido: as declarações do ai-sdk
  não têm brand), então código que ainda importa de `ai` segue compilando. O `@theokit/presenter` ganha
  `zod` como peer — a única exigência nova, e ele está em 0.x.

  Correções que vêm junto, todas de defeitos que existiriam em qualquer parser de wire escrito sem
  elas:

  - O frame terminal `data: [DONE]` não é JSON. Sem guarda, um parser quebraria no **último frame de
    toda resposta**.
  - Terminadores CRLF/CR passam a ser normalizados. Sem isso, um proxy que os reescreve produzia
    silêncio total — nem erro, nem renderização.
  - Um erro de provider no meio do stream preserva o texto já entregue e só então falha.

  `ai` permanece como `devDependency`: um teste diferencial alimenta o mesmo stream nele e no nosso
  parser, exigindo saída idêntica variante por variante. É o que torna a reimplementação verificável
  em vez de uma aposta.

## 0.2.0

### Minor Changes

- 70a4daa: Presentation layer (M49): new `@theokit/presenter` package — the canonical `AgentOutputEvent` (narrow-waist normalized event) + the `Presenter` Strategy contract + registry + `UIMessageStreamPresenter` (the web surface) + `fromSdk` source translator. `@theokit/agents` now composes its web `UIMessageStream` path over the shared presenter (`presentUIMessageStream`), replacing the inline `translateToUIMessageStream` (removed — the public export is now `presentUIMessageStream`). Behavior is byte-identical (the full existing web test corpus — unit + M1 E2E — passes unchanged against the new path). This closes the web/terminal translation duplication surfaced by dogfooding agent-builder; terminal/JSON presenters follow in M50/M51. No backward-compat shim (owner-approved clean break).
