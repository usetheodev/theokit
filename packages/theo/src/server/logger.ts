export interface RequestLog {
  level: string
  method: string
  url: string
  status: number
  duration: number
  requestId: string
  timestamp: string
}

export function logRequest(info: Omit<RequestLog, 'level' | 'timestamp'>): void {
  const log: RequestLog = {
    level: 'info',
    ...info,
    timestamp: new Date().toISOString(),
  }
  console.log(JSON.stringify(log))
}
