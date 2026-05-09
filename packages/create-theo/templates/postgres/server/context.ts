import { db } from '../db/index.js'

export function createContext() {
  return { db }
}
