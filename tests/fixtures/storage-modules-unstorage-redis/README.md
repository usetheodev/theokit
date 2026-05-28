# Fixture — storage-modules-unstorage-redis

End-to-end proof of `useUnstorage(name, driver)` with a Redis-style mock driver (T3.2, ADR-0009).

## What this shows

A minimal TheoKit app declaring a cache via `useUnstorage` + a custom driver matching the `unstorage` `Driver` interface. The mock driver wraps an in-memory Map (no real Redis required), so CI runs deterministically.

## Files

- `theo.config.ts` — TheoKit config (no storage block needed; `useUnstorage` is called at runtime with the driver)
- `server/lib/mock-redis-driver.ts` — custom Driver implementation conforming to `unstorage.Driver`
- `server/lib/cache.ts` — `useUnstorage('cache', mockRedisDriver({...}))` consumer

## Validation

`tests/integration/storage-modules-unstorage-fixture.test.ts` boots this fixture and verifies:
- setItem / getItem roundtrip via mock driver
- removeItem clears value
- dispose drains storage cleanly
- concurrent writes resolve last-write-wins
- mock driver passes EC-7 `Driver` interface type check
