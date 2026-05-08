---
name: changelog
description: Update CHANGELOG.md following Keep a Changelog format. Use when asked to update changelog or after completing features.
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Edit
argument-hint: "[version]"
---

Update the CHANGELOG.md following Keep a Changelog + Semantic Versioning.

## Steps

1. Read current CHANGELOG.md
2. Read git log since last version tag: `git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~20)..HEAD`
3. Categorize changes: Added, Changed, Deprecated, Removed, Fixed, Security
4. Write entries under `[Unreleased]` section
5. If `$ARGUMENTS` is a version: move Unreleased entries to that version with today's date

## Rules

- Every entry has ticket/PR reference: `(#142)`
- Write for the CONSUMER, not the developer
- One line per change
- Never edit released versions — create new entry if correction needed
- No vague entries: "performance improvements", "various fixes"
