# Issue Taxonomy

## Severity

| Level | Meaning | Criteria |
|---|---|---|
| **CRITICAL** | Blocks usage, data loss, security hole | Crash, panic, data corruption, secret leak |
| **HIGH** | Major feature broken, bad UX | Feature doesn't work, confusing error, silent fail |
| **MEDIUM** | Minor feature issue, inconsistency | Cosmetic, wrong exit code, minor formatting |
| **LOW** | Enhancement, polish | Nice-to-have, minor improvement |

## Categories

| Category | Examples |
|---|---|
| **CRASH** | Process exits unexpectedly, unhandled exception |
| **WRONG_OUTPUT** | Command produces incorrect results |
| **SILENT_FAIL** | Command fails without indication |
| **ERROR_MSG** | Error message is unhelpful or misleading |
| **DX** | Poor developer experience, confusing workflow |
| **PERFORMANCE** | Unacceptable latency, memory usage |
| **TYPE_SAFETY** | Types don't infer correctly, any leaks |
| **SECURITY** | Secret leak, missing CSRF, header missing |
| **BOUNDARY** | Server code in client bundle, wrong dependency |
| **SCOPE** | Feature outside MVP scope |

## ID Format

`{severity_letter}{number}` — e.g., C1, H3, M2, L5

- C = CRITICAL
- H = HIGH
- M = MEDIUM
- L = LOW
