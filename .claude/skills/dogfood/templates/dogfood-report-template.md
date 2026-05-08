# Dogfood Report — Theo Framework

**Date:** {YYYY-MM-DD}
**Commit:** {SHA}
**Node:** {version}
**Mode:** {full|quick|scaffold|dev|build|routes|actions|dx}

## Executive Summary

**Health Score: {N}/100**

| Phase | Score | Weight | Weighted |
|---|---|---|---|
| Scaffold | {N}% | 20% | {N} |
| Dev Server | {N}% | 20% | {N} |
| Build + Production | {N}% | 20% | {N} |
| Routes + Actions | {N}% | 20% | {N} |
| DX Evaluation | {N}% | 20% | {N} |

## Issues Found

### CRITICAL ({N})

| ID | Phase | Description | Steps to Reproduce | Fix Suggested |
|---|---|---|---|---|
| C1 | ... | ... | ... | ... |

### HIGH ({N})

| ID | Phase | Description | Steps to Reproduce | Fix Suggested |
|---|---|---|---|---|
| H1 | ... | ... | ... | ... |

### MEDIUM ({N})

| ID | Phase | Description |
|---|---|---|
| M1 | ... | ... |

### LOW ({N})

| ID | Phase | Description |
|---|---|---|
| L1 | ... | ... |

## Phase Details

### Phase 1: Pre-flight
{environment details}

### Phase 2: Scaffold
{scaffold results}

### Phase 3: Dev Server
{dev server results}

### Phase 4: Build + Production
{build results}

### Phase 5: Routes + Actions
{routes/actions results}

### Phase 6: DX Evaluation

| Dimension | Score (1-5) | Evidence |
|---|---|---|
| Help Quality | {N} | {details} |
| Error Messages | {N} | {details} |
| Exit Codes | {N} | {details} |
| Type Safety | {N} | {details} |
| Progressive Disclosure | {N} | {details} |
| Discoverability | {N} | {details} |
| Consistency | {N} | {details} |
| Speed | {N} | {details} |

**DX Average: {N}/5**

## Regression Tests Suggested

| Issue ID | Test Name | What to Assert |
|---|---|---|
| C1 | `dogfood_{date}_{id}_{brief}` | {assertion} |

## Comparison with Previous Dogfood

| Metric | Previous | Current | Delta |
|---|---|---|---|
| Health Score | {N} | {N} | {+/-N} |
| CRITICAL Issues | {N} | {N} | {+/-N} |
| DX Average | {N} | {N} | {+/-N} |
