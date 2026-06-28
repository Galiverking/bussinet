// ESLint Flat Config — v9+ compatible (browser project)
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        // Browser globals
        document: 'readonly',
        window: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        FileReader: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        // App-level globals (exposed by init.js)
        supabase: 'readonly',
        refreshJobList: 'readonly',
        openAddModal: 'readonly',
        openParserModal: 'readonly',
        openQueueParserModal: 'readonly',
        openExpenseModal: 'readonly',
        openDetailModal: 'readonly',
        openEditById: 'readonly',
        toggleTab: 'readonly',
        toggleSort: 'readonly',
        undoJob: 'readonly',
        completeJob: 'readonly',
        deleteJob: 'readonly',
        doConfirmDelete: 'readonly',
        importBackup: 'readonly',
        exportJobs: 'readonly',
        openImportBackup: 'readonly',
        openPostponeModal: 'readonly',
        closeDetailModal: 'readonly',
        updateParsedLoc: 'readonly',
        initGeo: 'readonly',
      },
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
