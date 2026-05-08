export class TheoProjectError extends Error {
  public readonly errors: string[]
  public readonly rootDir: string

  constructor(errors: string[], rootDir: string) {
    const errorLines = errors.map((e) => `  - ${e}`).join('\n')

    super(
      `Invalid Theo project structure\n\n` +
        `  Root: ${rootDir}\n\n` +
        (errorLines ? `  Errors:\n${errorLines}\n` : ''),
    )

    this.name = 'TheoProjectError'
    this.errors = errors
    this.rootDir = rootDir
  }
}
