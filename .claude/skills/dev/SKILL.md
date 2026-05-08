---
name: dev
description: Start the development environment. Use when asked to start dev server, run dev, or develop.
user-invocable: true
allowed-tools: Bash(npm *), Bash(npx *)
argument-hint: "[port]"
---

Start the Theo dev environment.

## Steps

1. Check dependencies are installed: `ls node_modules/.package-lock.json 2>/dev/null || npm install`
2. Run type check: `npx tsc --noEmit`
3. Start dev server: `npm run dev` (or `theo dev`)
4. Report URL and status

## Arguments

- No args: default port (3000)
- Port number: `npm run dev -- --port $ARGUMENTS`
