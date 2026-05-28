/**
 * Singleton usage storage for the full-stack-agent example. Production
 * apps swap this for Postgres/Redis (recipes in R0.6.7). The InMemory
 * adapter is unbounded by design — see EC-114.
 */
import { InMemoryUsageStorage } from 'theokit/server'

export const usageStorage = new InMemoryUsageStorage()
