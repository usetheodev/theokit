import { describe, expect, it, vi } from 'vitest'

import { ConfigurationError } from '../../src/errors.js'
import type { TemplateDeps } from '../../src/config/command-template.js'
import { expandCommandTemplate } from '../../src/config/command-template.js'

/**
 * A failed injected command built a prompt out of its own error message, and the fenced form did
 * nothing at all. Both failed toward "proceed with something wrong" rather than "stop".
 *
 * ## The failure path
 *
 * The spec is explicit: "A failed command aborts the entire skill invocation… Claude never sees the
 * skill content for that invocation." What happened instead was substitution plus a warning. A
 * command whose `gh pr diff` failed produced a prompt containing `fatal: not a git repository`,
 * handed to a model that had been asked to review a diff — and it answered as though that WERE the
 * diff.
 *
 * The previous behaviour was decided, and the reasoning it was decided against is worth keeping:
 * substituting SILENCE renders as a command that ran and returned nothing, which the model cannot
 * detect. That is true, and it weighed the wrong two options. The third — stop — is the one the
 * spec names, and it is the only one where the caller learns anything.
 *
 * `@file` misses stay warnings, deliberately. A missing file is content the template POINTED at; a
 * failed command is content the template CAUSED. Only the second can hand the model a plausible
 * lie: `fatal:` reads as prose, while an absent file leaves a gap.
 *
 * ## The fenced form
 *
 * A ```` ```! ```` block containing real commands came back byte-identical: the model received the
 * command text as markdown, with no error and nothing run. Refused rather than implemented —
 * "run a multi-line block" has real unanswered semantics (each line a command? one script? which
 * shell?), and inventing them would ship behaviour under a name that promises the spec's.
 */
function deps(over: Partial<TemplateDeps> = {}): TemplateDeps & { warn: ReturnType<typeof vi.fn> } {
  return {
    warn: vi.fn(),
    shell: vi.fn(async () => ({ text: 'ok', ok: true })),
    readFile: vi.fn(() => 'file body'),
    ...over,
  } as TemplateDeps & { warn: ReturnType<typeof vi.fn> }
}

describe('an injected command that fails stops the invocation', () => {
  it('throws instead of substituting the failure text', async () => {
    const d = deps({
      shell: vi.fn(async () => ({ text: 'fatal: not a git repository', ok: false })),
    })
    await expect(
      expandCommandTemplate('Review this diff: !`gh pr diff`', '', d),
      'the model was handed an error message and asked to treat it as a diff',
    ).rejects.toThrow(ConfigurationError)
  })

  it('names the command that failed and carries its output', async () => {
    const d = deps({
      shell: vi.fn(async () => ({ text: 'fatal: not a git repository', ok: false })),
    })
    await expect(expandCommandTemplate('!`gh pr diff`', '', d)).rejects.toThrow(
      /gh pr diff[\s\S]*fatal: not a git repository/,
    )
  })

  it('still substitutes a command that succeeded', async () => {
    // The control. A change that threw on every command would satisfy both tests above and remove
    // the feature.
    const d = deps({ shell: vi.fn(async () => ({ text: 'DIFF', ok: true })) })
    expect(await expandCommandTemplate('a !`git diff` b', '', d)).toBe('a DIFF b')
  })

  it('still WARNS, rather than throwing, for a file it cannot read', async () => {
    // The second control, and the line this change deliberately does not cross. A missing file is
    // content the template POINTED at; a failed command is content the template CAUSED.
    const d = deps({ readFile: vi.fn(() => undefined) })
    expect(await expandCommandTemplate('see @missing.md', '', d)).toBe('see ')
    expect(d.warn).toHaveBeenCalledTimes(1)
  })

  it('refuses a fenced multi-line command block instead of ignoring it', async () => {
    const template = ['```!', 'git fetch', 'git diff main', '```'].join('\n')
    const d = deps()
    await expect(
      expandCommandTemplate(template, '', d),
      'the block came back byte-identical: the model read the commands as markdown and nothing ran',
    ).rejects.toThrow(/fenced/i)
  })

  it('leaves an ordinary fenced block alone', async () => {
    // The control that keeps the refusal narrow. A markdown code block is not a command block.
    const template = ['```bash', 'git fetch', '```'].join('\n')
    expect(await expandCommandTemplate(template, '', deps())).toBe(template)
  })
})
