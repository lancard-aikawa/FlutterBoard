'use strict';
const globals = require('globals');

module.exports = [
  {
    files: ['server/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'eqeqeq': ['warn', 'smart'],
      'no-var': 'warn',
      'no-undef': 'warn',
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'eqeqeq': ['warn', 'smart'],
      'no-var': 'warn',
      'no-undef': 'warn',
    },
  },
];
