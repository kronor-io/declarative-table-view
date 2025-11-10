import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      // Enforce function declarations for components and disallow React.FC / FunctionComponent types
      'no-restricted-syntax': [
        'error',
        { selector: "TSTypeReference > TSQualifiedName[object.name='React'][property.name='FC']", message: 'Do not use React.FC; use a named function declaration instead.' },
        { selector: "TSTypeReference > TSQualifiedName[object.name='React'][property.name='FunctionComponent']", message: 'Do not use React.FunctionComponent; use a named function declaration instead.' },
      ],
      // Using ban-types is not available in flat config via @typescript-eslint yet; relying on no-restricted-syntax selectors above.
      'indent': ['error', 4, { 'SwitchCase': 1 }],
    },
  },
)
