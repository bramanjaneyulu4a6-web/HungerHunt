import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'android']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // The Vite config is Node code, not browser code: it reads
    // VITE_DEV_PROXY_TARGET off process.env to point the dev server at a
    // backend. Linting it with browser globals only reports that as no-undef.
    files: ['vite.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
