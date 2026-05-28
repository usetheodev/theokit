// ESLint flat config — quality gate (strict from day 1).
//
// Stack: typescript-eslint v8 + ESLint v9 + React 19. Rules selected to
// catch real bugs, not stylistic preferences (Prettier owns style). See
// CLAUDE.md "PARTE I — Regras de conduta" for the engineering principles.
//
// Severity policy:
//   - "error" for bug-producing patterns (no-floating-promises, no-misused-promises, etc).
//   - "warn" for code smells that need human judgment (complexity, max-lines).
//   - "off" for noisy stylistic rules (handled by Prettier or out of scope).

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import importPlugin from 'eslint-plugin-import'
import nodePlugin from 'eslint-plugin-n'
import promisePlugin from 'eslint-plugin-promise'
import securityPlugin from 'eslint-plugin-security'
import sonarjsPlugin from 'eslint-plugin-sonarjs'
import unicornPlugin from 'eslint-plugin-unicorn'
import unusedImportsPlugin from 'eslint-plugin-unused-imports'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  // Ignored paths (replaces .eslintignore in flat config).
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.theo/**',
      '**/coverage/**',
      '**/test-results/**',
      'referencias/**',
      'pnpm-lock.yaml',
      'fixtures/**/dist/**',
      'examples/**/dist/**',
      'my-test/**',
      // Worktrees created by agent runtimes are sandboxes with their own
      // checkout state and possibly stale TS project graphs. They are not
      // shipping code; linting them inflates error counts and breaks the
      // type-checked parser (no projectService entry).
      '.claude/worktrees/**',
      // create-theo `templates/` are pristine scaffold blueprints that get
      // copied into the user's project. They are NOT framework code; they
      // exist as didactic starting points. Lint-checking them creates
      // confusing reports (the user will write their own version anyway)
      // and would break with every minor scaffold-style change.
      'packages/create-theo/templates/**',
      // Fixtures + examples have their own per-folder tsconfig that the
      // root project service does not own. They are end-user demo apps,
      // not framework code; linting them produces parser-only errors that
      // do not represent real issues in the shipping framework surface.
      'fixtures/**',
      'examples/**',
    ],
  },

  // Base JS recommended.
  js.configs.recommended,

  // TypeScript strict + type-checked.
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // SonarJS (code smells).
  sonarjsPlugin.configs.recommended,

  // Project-wide language options.
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },

  // Plugins + rules for TS/TSX sources.
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      import: importPlugin,
      n: nodePlugin,
      promise: promisePlugin,
      security: securityPlugin,
      unicorn: unicornPlugin,
      'unused-imports': unusedImportsPlugin,
    },
    settings: {
      react: { version: '19.0' },
      'import/resolver': {
        typescript: { project: ['tsconfig.json', 'packages/*/tsconfig.json'] },
        node: true,
      },
    },
    rules: {
      // --- Real-bug catchers (errors) ---
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      // `restrict-template-expressions` policy: stop `${obj}` and `${arr}`
      // (the `[object Object]` foot-gun is real) but accept primitives in
      // template strings. `${42}` → "42" is safe behavior, not a smell.
      // The dangerous case is still caught by `no-base-to-string`.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: true, allowRegExp: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': 'off', // handled by unused-imports
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
      ],

      // Promises — fail loud, never silently swallow.
      'promise/no-return-wrap': 'error',
      'promise/param-names': 'error',
      'promise/catch-or-return': 'error',
      'promise/no-nesting': 'warn',

      // Security — defense in depth at the lint layer.
      'security/detect-object-injection': 'off', // too noisy for TS, type system already catches the real ones
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-eval-with-expression': 'error',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-new-buffer': 'error',

      // React.
      'react/jsx-uses-react': 'off', // React 19 / jsx-runtime
      'react/react-in-jsx-scope': 'off',
      'react/jsx-key': 'error',
      'react/no-unescaped-entities': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // Imports — no cycles, no extraneous.
      'import/no-cycle': ['error', { maxDepth: 5, ignoreExternal: true }],
      'import/no-self-import': 'error',
      'import/no-useless-path-segments': 'error',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-default-export': 'off',

      // Code-smell guards (warn — human judgment).
      'sonarjs/cognitive-complexity': ['warn', 20],
      'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-collapsible-if': 'warn',
      'sonarjs/no-redundant-jump': 'warn',
      'sonarjs/no-small-switch': 'off',
      // Duplicate rules — already covered by other plugins, surfaced once
      // is enough (turning off the duplicate is not a bypass; it removes
      // the redundant report). The "kept" rule is named in the comment.
      'sonarjs/unused-import': 'off', // kept: unused-imports/no-unused-imports
      'sonarjs/no-unused-vars': 'off', // kept: unused-imports/no-unused-vars
      'sonarjs/prefer-regexp-exec': 'off', // kept: @typescript-eslint/prefer-regexp-exec
      'sonarjs/no-nested-functions': 'off', // overlaps with complexity + max-lines-per-function
      'sonarjs/different-types-comparison': 'off', // overlaps with @typescript-eslint/no-unnecessary-condition

      // Complexity ceilings (warn — refactor signal, not block).
      complexity: ['warn', { max: 15 }],
      'max-depth': ['warn', 4],
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'warn',
        { max: 120, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      'max-params': ['warn', 5],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Unicorn — surgical (most opinionated rules off; only bug-shaped ones on).
      'unicorn/error-message': 'error',
      'unicorn/no-array-push-push': 'warn',
      'unicorn/no-instanceof-array': 'error',
      'unicorn/no-new-array': 'error',
      'unicorn/no-useless-undefined': 'off',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-set-has': 'warn',
      'unicorn/throw-new-error': 'error',
      'unicorn/no-await-in-promise-methods': 'error',
      'unicorn/no-single-promise-in-promise-methods': 'error',
    },
  },

  // Type-only tests (`*.test-d.ts`) — assertions are `expectTypeOf<...>()`
  // which sonarjs does not recognize as a test assertion. The TS compiler
  // is the actual checker for these files (`tsc --noEmit` is the gate).
  {
    files: ['**/*.test-d.{ts,tsx}'],
    rules: {
      'sonarjs/assertions-in-tests': 'off',
    },
  },

  // Test files — relaxed (test code is documentation, not production).
  {
    files: ['tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', '**/*.test-d.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      'sonarjs/slow-regex': 'off',
      'sonarjs/no-identical-functions': 'off',
      'sonarjs/prefer-regexp-exec': 'off',
      'sonarjs/deprecation': 'off',
      'sonarjs/no-collapsible-if': 'off',
      'sonarjs/no-unused-vars': 'off',
      'sonarjs/no-dead-store': 'off',
      'sonarjs/publicly-writable-directories': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-depth': 'off',
      'max-params': 'off',
      complexity: 'off',
      'no-console': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-child-process': 'off',
      'security/detect-non-literal-regexp': 'off',
      'import/order': 'off',
      'promise/param-names': 'off',
      'promise/catch-or-return': 'off',
      'unicorn/no-array-push-push': 'off',
      'unicorn/no-await-in-promise-methods': 'off',
    },
  },

  // Fixtures — these are scaffold TEMPLATES, not framework code. Apply
  // ergonomic rules only; everything else is irrelevant to user-facing
  // scaffold quality (and many warnings actually exist as didactic
  // examples of what apps may do).
  {
    files: ['fixtures/**/*.{ts,tsx}', 'examples/**/*.{ts,tsx}', 'my-test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/array-type': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      'sonarjs/slow-regex': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/deprecation': 'off',
      'sonarjs/no-collapsible-if': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-params': 'off',
      'max-depth': 'off',
      complexity: 'off',
      'no-console': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-child-process': 'off',
      'security/detect-non-literal-regexp': 'off',
      'import/order': 'off',
    },
  },

  // Scripts / config files (Node-only, less strict typing).
  {
    files: ['**/*.config.{ts,mts,cts,js,mjs,cjs}', 'scripts/**/*.{ts,js,mjs}', '**/tsup.config.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      'no-console': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-child-process': 'off',
    },
  },

  // CLI commands — `console.log` IS the output of the program. Disabling
  // `no-console` here is not a bypass; the rule exists to keep stray
  // debug prints out of business logic, which is irrelevant in a CLI
  // tool whose stdout/stderr is its user interface.
  {
    files: [
      'packages/theo/src/cli/**/*.ts',
      'packages/create-theo/src/cli.ts',
      'packages/create-theo/src/index.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },

  // JS files (no type-checking).
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Prettier compat (must be last — disables formatting rules).
  prettierConfig,
)
