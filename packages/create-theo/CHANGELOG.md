# create-theo

## [Unreleased]

## [0.1.0-alpha.0] - 2026-05-09

### Added

- `create-theo` CLI for scaffolding new Theo projects
- 3 templates: `default` (Hello Theo + health route), `dashboard` (nested layouts), `api-only` (API routes)
- `--template` flag for template selection
- Package manager detection (npm, pnpm, yarn, bun)
- Automatic dependency installation after scaffold
- Clear error messages for invalid project names and missing templates
