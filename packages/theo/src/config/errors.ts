export interface ConfigIssue {
  field: string
  message: string
}

export class TheoConfigError extends Error {
  public readonly issues: ConfigIssue[]
  public readonly configPath: string

  constructor(issues: ConfigIssue[], configPath: string) {
    const issueLines = issues.map((i) => `  - ${i.field}: ${i.message}`).join('\n')

    super(
      `Invalid theo.config.ts\n\n` +
        `  File: ${configPath}\n\n` +
        (issueLines ? `  Issues:\n${issueLines}\n` : ''),
    )

    this.name = 'TheoConfigError'
    this.issues = issues
    this.configPath = configPath
  }
}
