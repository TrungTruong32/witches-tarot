import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'Data', 'la-bai', 'local', 'tests/legacy/*.html', '.superpowers', '.vercel', '.codegraph'] },
  // Code mới (TypeScript) — luật chặt
  {
    files: ['src/**/*.{ts,tsx}', 'shared/**/*.ts', 'tests/**/*.ts', 'api/**/*.ts', 'vite.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  // Module JS dùng chung (client + api)
  { files: ['shared/**/*.js'], extends: [js.configs.recommended] },
);
