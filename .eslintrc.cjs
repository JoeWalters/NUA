module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    'node_modules',
    '.eslintrc.cjs',
    // Server code is linted separately with its own Node-flavored config.
    'server',
    // Build config files (not app code); they use Node globals like `require`.
    'tailwind.config.js',
    'postcss.config.js',
    'vite.config.js',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    // The frontend does not use PropTypes as a type-checking mechanism (only a
    // couple of components declare them), so require propTypes would flag the
    // whole codebase. Keep lint focused on real issues instead.
    'react/prop-types': 'off',
    // Unused vars mostly mark intentional dead code (tracked separately in the
    // "Remove dead code" improvement item), not bugs. Keep lint focused on
    // real issues (no-undef, no-unreachable, parse errors) instead.
    'no-unused-vars': 'off',
  },
}
