# Logis Master - Refactoring Plan
Date: 2026-05-13

## Status: IN PROGRESS

---

## Phase 1: Tooling Setup

### 1.1 package.json
```json
{
  "name": "logis-master",
  "version": "1.0.0",
  "scripts": {
    "lint": "eslint js/",
    "lint:fix": "eslint js/ --fix",
    "format": "prettier --write js/"
  },
  "devDependencies": {
    "eslint": "^8.57.0",
    "prettier": "^3.2.0"
  }
}
```

### 1.2 .eslintrc.json
```json
{
  "env": { "browser": true, "es2022": true },
  "globals": { "supabase": "readonly" },
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "off",
    "eqeqeq": ["error", "always"],
    "no-var": "error",
    "prefer-const": "error"
  }
}
```

### 1.3 .prettierrc
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

---

## Phase 2: Directory Structure

### Create directories
```
js/
├── core/
│   ├── constants.js
│   ├── store.js
│   └── events.js
├── services/
│   ├── supabase.js
│   ├── location.js
│   └── parser/
│       ├── tokenizer.js
│       ├── extractor.js
│       ├── validator.js
│       └── formatter.js
├── ui/
│   ├── renderer.js
│   ├── modals.js
│   └── components.js
└── utils/
    ├── formatters.js
    └── validators.js
```

---

## Phase 3: Code Migration Order

1. Constants → js/core/constants.js
2. Store pattern → js/core/store.js
3. Supabase service → js/services/supabase.js
4. Utils → js/utils/
5. Parser layer → js/services/parser/
6. Location service → js/services/location.js
7. UI modules → js/ui/
8. app.js → Entry point (refactor)

---

## Phase 4: Update index.html

Change script to module import

---

## Phase 5: Verify

- Run npm run lint
- Test in browser

---

## Checklist (Progress)

- [x] 1. Write plan to file
- [ ] 2. Create package.json + install
- [ ] 3. Create .eslintrc.json + .prettierrc
- [ ] 4. Create directory structure
- [ ] 5. Refactor constants → js/core/constants.js
- [ ] 6. Create store pattern → js/core/store.js
- [ ] 7. Refactor supabase → js/services/supabase.js
- [ ] 8. Refactor parser → js/services/parser/
- [ ] 9. Refactor location → js/services/location.js
- [ ] 10. Refactor utils → js/utils/
- [ ] 11. Refactor UI → js/ui/
- [ ] 12. Rewrite app.js as entry point
- [ ] 13. Update index.html imports
- [ ] 14. Run lint → fix errors
- [ ] 15. Test all features