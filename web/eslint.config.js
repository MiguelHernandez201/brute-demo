import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'originales/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // La demo une el motor original (sin tipos completos) con la interfaz
      '@typescript-eslint/no-explicit-any': 'off',
      // Avisos frecuentes en el código copiado de LaBrute: se reportan sin romper el build
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-useless-assignment': 'warn',
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  prettier,
);
