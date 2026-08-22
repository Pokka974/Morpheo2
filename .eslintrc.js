module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react-native/all',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'react', 'react-native'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'react-native/no-unused-styles': 'error',
    'react-native/no-inline-styles': 'warn',
    'react-native/no-color-literals': 'warn',
    'react-native/sort-styles': 'off',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    'coverage/',
    '*.js',
    '!babel.config.js',
    '!jest.config.js',
    '!.eslintrc.js',
    // Deno Edge Functions: separate runtime, use remote URL imports, and are explicitly
    // excluded from tsconfig.json — not part of this project's type-checked TS program.
    'supabase/functions/',
  ],
  overrides: [
    {
      // Jest test files and service mocks legitimately need loose typing (jest.fn(), require(),
      // untyped mock chains, no-op async stubs to satisfy an interface) that the strict
      // type-checked ruleset is not meant to police outside of real app source.
      files: ['tests/**/*.{ts,tsx}', 'src/**/__mocks__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/require-await': 'off',
        '@typescript-eslint/await-thenable': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        'react/display-name': 'off',
      },
    },
  ],
};
