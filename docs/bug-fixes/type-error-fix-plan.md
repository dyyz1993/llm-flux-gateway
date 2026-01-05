# TypeScript Error Fix Plan

## Executive Summary

**Total Type Errors**: 1,663 errors

**Status**: Type checking infrastructure is now in place. Errors are documented and categorized for systematic resolution.

**Impact**: Pre-commit hooks will block commits with type errors. This ensures code quality but requires fixing errors before committing.

## Infrastructure Completed

### 1. Husky Pre-commit Hooks

**File**: `.husky/pre-commit`

**Features**:
- Runs TypeScript type check (`tsc --noEmit`)
- Runs all tests (`npm test -- --run --reporter=basic`)
- Blocks commits if either check fails
- Provides clear error messages

**Usage**:
```bash
# Test the hook manually
./.husky/pre-commit

# The hook runs automatically on: git commit
```

### 2. Enhanced ESLint Configuration

**File**: `eslint.config.js`

**New Rules Added**:
- `@typescript-eslint/no-explicit-any`: warn
- `@typescript-eslint/no-unsafe-assignment`: warn
- `@typescript-eslint/no-unsafe-member-access`: warn
- `@typescript-eslint/no-unsafe-call`: warn
- `@typescript-eslint/no-unsafe-return`: warn
- `@typescript-eslint/no-unused-vars`: warn (with ignore patterns)

**Strategy**: Using "warn" level to allow gradual adoption without blocking development.

### 3. New NPM Scripts

**File**: `package.json`

**Available Commands**:
```bash
npm run type-check      # Run TypeScript type checking
npm run lint            # Run ESLint
npm run lint:fix        # Fix ESLint errors automatically
npm run format          # Format code with Prettier
npm run format:check    # Check code formatting
```

### 4. Type Checking Script

**File**: `scripts/check-types.sh`

**Features**:
- Runs type check and saves detailed log
- Counts total errors
- Shows top 20 files with most errors
- Generates `scripts/type-errors.log` report

**Usage**:
```bash
npm run check:types  # If added to package.json
# Or directly:
bash scripts/check-types.sh
```

## Error Analysis

### High-Level Statistics

| Category | Count | Percentage |
|----------|-------|------------|
| **Total Errors** | 1,663 | 100% |
| **Delta-related** | 71 | 4.3% |
| **Messages-related** | 40 | 2.4% |
| **Test Files** | ~800 | ~48% |
| **Source Files** | ~863 | ~52% |

### Top 20 Files with Most Errors

| Rank | Errors | File |
|------|--------|------|
| 1 | 101 | `src/server/module-protocol-transpiler/converters/anthropic.converter.ts` |
| 2 | 82 | `src/server/module-protocol-transpiler/interfaces/__tests__/internal-format.test.ts` |
| 3 | 64 | `src/server/module-protocol-transpiler/converters/__tests__.backup/anthropic-glm-fields.test.ts` |
| 4 | 60 | `src/server/module-protocol-transpiler/converters/__tests__/anthropic-glm-fields.test.ts` |
| 5 | 57 | `src/server/module-protocol-transpiler/converters/gemini.converter.ts` |
| 6 | 56 | `src/server/module-protocol-transpiler/core/__tests__/protocol-transpiler.test.ts` |
| 7 | 52 | `src/server/module-protocol-transpiler/converters/__tests__.backup/anthropic-text-field-bug.test.ts` |
| 8 | 48 | `src/client/hooks/__tests__/useAIStream.test.ts` |
| 9 | 47 | `src/server/module-protocol-transpiler/core/__tests__/conversion-integration.test.ts` |
| 10 | 47 | `src/server/module-protocol-transpiler/converters/__tests__/anthropic-text-field-bug.test.ts` |

**Observation**: 8 of top 10 files are test files. This suggests test data/mocking issues rather than core logic problems.

### Error Categories by Type

#### 1. Delta-Related Errors (71 errors)

**Pattern**:
```
error TS2345: Argument of type 'string | object' is not assignable to parameter of type 'InternalStreamDelta'
error TS2322: Type 'string' is not assignable to type 'InternalStreamDelta'
```

**Root Cause**: Mismatch between `delta: string | object` and expected `InternalStreamDelta` type.

**Files Affected**:
- `anthropic.converter.ts` (30 errors)
- `gemini.converter.ts` (25 errors)
- `openai.converter.ts` (16 errors)

**Fix Strategy**:
```typescript
// Before
delta: string | object

// After
delta: InternalStreamDelta

// Or with proper guard
if (typeof delta === 'string') {
  // Handle string delta
} else {
  // Handle object delta
}
```

#### 2. Messages-Related Errors (40 errors)

**Pattern**:
```
error TS2345: Argument of type '{ role: string; content: string }[]' is not assignable to parameter of type 'InternalMessage[]'
```

**Root Cause**: Test data uses plain objects instead of `InternalMessage` type.

**Files Affected**:
- Test files in `module-protocol-transpiler/converters/__tests__/`
- Mock data in client component tests

**Fix Strategy**:
```typescript
// Before
const mockMessages = [
  { role: 'user', content: 'Hello' }
];

// After
import type { InternalMessage } from '@shared/types';

const mockMessages: InternalMessage[] = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
];
```

#### 3. Unused Variable Errors (~200 errors)

**Pattern**:
```
error TS6133: 'X' is declared but its value is never read.
error TS6196: 'Y' is declared but never used.
```

**Root Cause**: Dead code from refactoring, debugging variables left in place.

**Fix Strategy**:
- Remove unused imports
- Prefix with underscore if intentional: `_unusedVar`
- Use ESLint auto-fix: `npm run lint:fix`

#### 4. Test Mock Errors (~500 errors)

**Pattern**:
```
error TS2769: No overload matches this call.
error TS2353: Object literal may only specify known properties
```

**Root Cause**: Test mocks don't match updated type definitions.

**Fix Strategy**:
```typescript
// Before
vi.mocked(mockFunction).mockReturnValue({
  id: '123',
  name: 'Test'
  // Missing required fields
});

// After
vi.mocked(mockFunction).mockReturnValue({
  id: '123',
  name: 'Test',
  timestamp: Date.now(),
  // All required fields
} as RequestLog);
```

#### 5. Possibly Undefined Errors (~300 errors)

**Pattern**:
```
error TS18048: 'X' is possibly 'undefined'.
error TS2532: Object is possibly 'undefined'.
```

**Root Cause**: Missing null checks before accessing properties.

**Fix Strategy**:
```typescript
// Before
const value = array[0].property;

// After
const value = array[0]?.property;
// Or
if (array[0]) {
  const value = array[0].property;
}
```

## Priority Fix Plan

### Phase 1: Quick Wins (1-2 days)

**Goal**: Reduce error count by 50% (from 1,663 to ~800)

**Tasks**:
1. Fix unused variable errors (~200 errors)
   - Run `npm run lint:fix`
   - Manually review and remove remaining unused code

2. Add type imports to test files (~100 errors)
   ```typescript
   import type { InternalMessage, InternalStreamDelta } from '@shared/types';
   ```

3. Fix simple undefined checks (~100 errors)
   ```bash
   # Find patterns
   grep -rn "array\[0\]\." src/server
   # Replace with
   # array[0]?.
   ```

**Verification**:
```bash
npm run type-check
# Expected: ~800 errors remaining
```

### Phase 2: Core Protocol Errors (2-3 days)

**Goal**: Fix protocol transpiler type errors

**Tasks**:
1. Fix delta type errors in converters (~71 errors)
   - Update `anthropic.converter.ts`
   - Update `gemini.converter.ts`
   - Update `openai.converter.ts`

2. Update internal format types (~50 errors)
   - Review `src/server/module-protocol-transpiler/interfaces/internal-format.ts`
   - Ensure all converters use correct types

**Verification**:
```bash
npm run type-check
# Expected: ~600 errors remaining
```

### Phase 3: Test Data Fixes (3-4 days)

**Goal**: Fix all test mock errors

**Tasks**:
1. Update test fixtures in `module-protocol-transpiler/converters/__tests__/`
2. Fix client test mocks in `src/client/components/**/__tests__/`
3. Ensure all mock data matches current type definitions

**Verification**:
```bash
npm run type-check
# Expected: ~200 errors remaining
```

### Phase 4: Final Cleanup (1-2 days)

**Goal**: Zero type errors

**Tasks**:
1. Review remaining errors
2. Update type definitions if business logic requires
3. Add type assertions where appropriate (with comments explaining why)
4. Run full test suite to ensure no regressions

**Verification**:
```bash
npm run type-check
# Expected: 0 errors
npm test
# Expected: All tests pass
```

## Immediate Actions Required

### Before Next Commit

The pre-commit hook will now block commits with type errors. To proceed:

**Option 1: Fix Errors (Recommended)**
```bash
# See what errors you have
npm run type-check

# Fix quick wins
npm run lint:fix

# Commit fixes
git add .
git commit -m "fix: resolve type errors"
```

**Option 2: Temporary Bypass (Not Recommended)**
```bash
# ⚠️ This bypasses quality checks
git commit --no-verify -m "WIP: type errors still present"

# Only use this for:
# - Emergency fixes
# - Documentation changes
# - CI/CD infrastructure updates
```

### Recommended Workflow

1. **Start a new branch for type fixes**:
   ```bash
   git checkout -b fix/type-errors-phase1
   ```

2. **Focus on one file at a time**:
   ```bash
   # Fix the worst offender
   # src/server/module-protocol-transpiler/converters/anthropic.converter.ts
   ```

3. **Commit frequently**:
   ```bash
   git add anthropic.converter.ts
   git commit -m "fix: resolve type errors in anthropic converter"
   ```

4. **Run checks before pushing**:
   ```bash
   npm run type-check
   npm test
   ```

## Type Error Hotspots

### Files Requiring Immediate Attention

1. **`anthropic.converter.ts`** (101 errors)
   - Impact: Core protocol conversion logic
   - Priority: HIGH
   - Action: Fix delta type mismatches

2. **`internal-format.test.ts`** (82 errors)
   - Impact: Type definition validation
   - Priority: MEDIUM
   - Action: Update test data to match types

3. **`gemini.converter.ts`** (57 errors)
   - Impact: Google Gemini protocol support
   - Priority: HIGH
   - Action: Fix delta and messages types

### Safe to Ignore (Temporarily)

- Files in `__tests__.backup/` directories (not in active use)
- Legacy test scripts in `scripts/` directory
- Example scenarios that aren't part of core functionality

## Tools and Commands

### Daily Workflow

```bash
# Morning: Check status
npm run type-check

# During development: Fix as you go
npm run lint:fix

# Before commit: Verify
npm run type-check && npm test

# Push to CI: Only if local checks pass
git push
```

### Analysis Commands

```bash
# Count errors by file
grep "error TS" scripts/type-errors.log | cut -d'(' -f1 | sort | uniq -c | sort -rn

# Find specific error patterns
grep "error TS2345" scripts/type-errors.log | wc -l

# See errors in a specific file
grep "anthropic.converter.ts" scripts/type-errors.log

# Track progress over time
# Run this after each fix session
npm run type-check 2>&1 | grep "error TS" | wc -l
```

## Success Metrics

### Current State
- Total Errors: 1,663
- Type Check: FAILING
- Pre-commit: BLOCKING

### Target State (Phase 1)
- Total Errors: < 800
- Type Check: FAILING (but improved)
- Pre-commit: BLOCKING

### Target State (Phase 2)
- Total Errors: < 400
- Type Check: FAILING (significant progress)
- Pre-commit: BLOCKING

### Target State (Phase 3)
- Total Errors: < 100
- Type Check: PASSING (with strict mode off)
- Pre-commit: ALLOWING

### Target State (Final)
- Total Errors: 0
- Type Check: PASSING
- Pre-commit: ALLOWING
- All Tests: PASSING

## Resources

### Documentation
- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/intro.html
- ESLint TypeScript Rules: https://typescript-eslint.io/rules/

### Internal
- Full error log: `scripts/type-errors.log`
- Type definitions: `src/shared/types.ts`
- Internal format: `src/server/module-protocol-transpiler/interfaces/internal-format.ts`

### Getting Help
1. Check if error is documented in this plan
2. Search for similar fixes in the codebase
3. Ask team for clarification on business logic vs type safety tradeoffs

## Next Steps

1. **Review this plan** with the team
2. **Assign phases** to developers
3. **Create tracking issues** for each phase
4. **Start Phase 1** (Quick Wins)
5. **Track progress** daily using `npm run type-check`

---

**Generated**: 2026-01-05
**Total Estimated Time**: 7-11 days (depending on team size and priority)
**Blocker**: Pre-commit hooks now enforce type checking
