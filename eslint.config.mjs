// Minimal lint for TypeScript sources.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['apps/api/src/**/*.ts', 'packages/types/src/**/*.ts', 'packages/sdk/src/**/*.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { ignores: ['**/dist/**', '**/node_modules/**'] },
);
