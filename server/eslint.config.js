module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        // Node.js globals
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'writable',
        module: 'writable',
        exports: 'writable',
        // Express globals
        req: 'readonly',
        res: 'readonly',
        next: 'readonly',
        // Jest/Mocha testing (if added later)
        describe: 'writable',
        it: 'writable',
        expect: 'writable',
        beforeEach: 'writable',
        afterEach: 'writable',
      },
    },
    rules: {
      // Unused vars mostly mark intentional dead code (tracked separately in the
      // "Remove dead code" improvement item), not bugs. Keep lint focused on
      // real issues instead.
      'no-unused-vars': 'off',
      // The Node server legitimately logs via console (startup, job re-arm, UniFi
      // actions). Allow it; the legacy .eslintrc.js already set this off.
      'no-console': 'off',
      // Best practices
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      'brace-style': ['error', '1tbs'],
      'semi': ['error', 'always'],
      'no-var': 'error',
      // Styling (optional, can be tuned)
      'indent': ['error', 2],
      'quotes': ['error', 'single'],
      'comma-dangle': ['error', 'only-multiline'],
    },
  },
];
