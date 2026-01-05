# Quality Assurance Quick Reference

## Immediate Action Required

Pre-commit hooks are now **ACTIVE**. They will **BLOCK COMMITS** with type errors or failing tests.

## Quick Commands

```bash
# Check type errors (do this FIRST)
npm run type-check

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Run tests
npm test

# Check all before committing
npm run type-check && npm test
```

## If Type Errors Exist (1,663 errors currently)

**Option 1: Fix errors (RECOMMENDED)**
```bash
# See what you have
npm run type-check

# Fix quick wins
npm run lint:fix

# Commit your fixes
git add .
git commit -m "fix: resolve type errors"
```

**Option 2: Emergency bypass (NOT RECOMMENDED)**
```bash
# Only for emergencies!
git commit --no-verify -m "fix: emergency fix [SKIP-HOOKS]"
```

## What Was Set Up

1. **Husky Pre-commit Hooks** - Blocks commits with type errors
2. **ESLint Enhanced** - TypeScript-specific rules
3. **5 New NPM Scripts** - type-check, lint, lint:fix, format, format:check
4. **Type Analysis** - 1,663 errors documented
5. **Fix Plan** - 4-phase roadmap in `docs/TYPE_ERROR_FIX_PLAN.md`

## Error Statistics

- **Total Errors**: 1,663
- **Top File**: `anthropic.converter.ts` (101 errors)
- **Quick Wins**: ~200 errors (unused variables)
- **Test Files**: ~800 errors (48% of total)

## 4-Phase Fix Plan

| Phase | Errors | Duration | Focus |
|-------|--------|----------|-------|
| 1: Quick Wins | ~800 | 1-2 days | Unused vars, type imports |
| 2: Core Protocol | ~600 | 2-3 days | Delta/messages types |
| 3: Test Data | ~200 | 3-4 days | Test mocks |
| 4: Final | 0 | 1-2 days | Cleanup |

**Total**: 7-11 days

## Important Files

| File | Purpose |
|------|---------|
| `docs/TYPE_ERROR_FIX_PLAN.md` | Detailed fix strategy |
| `docs/QUALITY_ASSURANCE_SETUP_REPORT.md` | Full setup report |
| `scripts/type-errors.log` | All 1,663 errors |
| `scripts/check-types.sh` | Type checking script |

## Top 5 Files to Fix First

1. `src/server/module-protocol-transpiler/converters/anthropic.converter.ts` (101 errors)
2. `src/server/module-protocol-transpiler/interfaces/__tests__/internal-format.test.ts` (82 errors)
3. `src/server/module-protocol-transpiler/converters/gemini.converter.ts` (57 errors)
4. `src/server/module-protocol-transpiler/core/__tests__/protocol-transpiler.test.ts` (56 errors)
5. `src/client/hooks/__tests__/useAIStream.test.ts` (48 errors)

## Common Fix Patterns

### Fix 1: Unused Variables
```typescript
// Before
const unusedVar = getValue();

// After
// Remove it OR prefix with underscore
const _unusedVar = getValue();
```

### Fix 2: Type Imports
```typescript
// Before
import { InternalMessage } from '@shared/types';

// After
import type { InternalMessage } from '@shared/types';
```

### Fix 3: Undefined Checks
```typescript
// Before
const value = array[0].property;

// After
const value = array[0]?.property;
```

### Fix 4: Test Mocks
```typescript
// Before
mockFn.mockReturnValue({ id: '123' });

// After
mockFn.mockReturnValue({ id: '123', timestamp: Date.now(), ...allRequiredFields });
```

## Next Steps

1. Read the full fix plan: `docs/TYPE_ERROR_FIX_PLAN.md`
2. Create a branch: `git checkout -b fix/type-errors-phase1`
3. Start with quick wins (unused variables)
4. Commit frequently with hooks enabled
5. Track progress: `npm run type-check`

## Daily Workflow

```bash
# Morning: Check status
npm run type-check

# During dev: Fix as you go
npm run lint:fix

# Before commit: Verify
npm run type-check && npm test

# Commit: Hook runs automatically
git commit -m "fix: resolve type errors"
```

## Get Help

1. Check `docs/TYPE_ERROR_FIX_PLAN.md` for detailed guidance
2. Search for similar fixes in the codebase
3. Ask team for business logic vs type safety tradeoffs

## Success Metrics

- Current: 1,663 errors
- Phase 1 Target: < 800 errors
- Phase 2 Target: < 400 errors
- Phase 3 Target: < 100 errors
- Final Target: 0 errors

---

**Remember**: Pre-commit hooks are protecting code quality. Fix errors before committing!
