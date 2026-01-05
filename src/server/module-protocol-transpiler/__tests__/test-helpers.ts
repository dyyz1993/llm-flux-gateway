/**
 * Test Helpers for Protocol Transpiler Tests
 *
 * Provides utility functions for testing converters with proper type safety.
 */

import type { TranspileResult } from '../core/transpile-result';

/**
 * Assert that a transpile result is successful and return the data
 *
 * This function provides type narrowing for tests. After calling this function,
 * TypeScript knows that the result was successful and the data exists.
 *
 * @param result - The transpile result to check
 * @returns The data from the successful result
 * @throws Error if the result is not successful
 *
 * @example
 * ```ts
 * const result = converter.convertRequestFromInternal(request);
 * const data = assertSuccess(result); // Type is now Record<string, unknown>
 * expect(data.messages).toBeDefined();
 * ```
 */
export function assertSuccess<T>(result: TranspileResult<T>): T {
  if (!result.success) {
    throw new Error(
      `Expected successful result but got failure: ${JSON.stringify(result.errors)}`
    );
  }
  if (result.data! === undefined) {
    throw new Error('Expected data to be defined in successful result');
  }
  return result.data!;
}

/**
 * Assert that a transpile result is successful and return data with a specific type
 *
 * This is a typed version of assertSuccess for when you know the exact structure.
 *
 * @param result - The transpile result to check
 * @returns The data cast to the specified type
 * @throws Error if the result is not successful
 *
 * @example
 * ```ts
 * const result = converter.convertRequestFromInternal(request);
 * const data = assertSuccessWithType<AnthropicRequest>(result);
 * expect(data.messages).toHaveLength(3);
 * ```
 */
export function assertSuccessWithType<TData, TResult = unknown>(
  result: TranspileResult<TResult>
): TData {
  const data = assertSuccess(result);
  return data as unknown as TData;
}

/**
 * Assert that a transpile result failed
 *
 * @param result - The transpile result to check
 * @throws Error if the result is successful
 */
export function assertFailure<T>(result: TranspileResult<T>): void {
  if (result.success) {
    throw new Error('Expected failed result but got success');
  }
  if (!result.errors || result.errors.length === 0) {
    throw new Error('Expected errors to be defined in failed result');
  }
}

/**
 * Get data from a transpile result for testing (unsafe but convenient)
 *
 * This function assumes the result is successful. Use only in tests where
 * you've already validated success with expect().
 *
 * @param result - The transpile result
 * @returns The data (may be undefined)
 *
 * @example
 * ```ts
 * const result = converter.convertRequestFromInternal(request);
 * expect(result.success).toBe(true);
 * const data = getData(result); // Don't need type guards after expect
 * expect(data?.messages).toBeDefined();
 * ```
 */
export function getData<T>(result: TranspileResult<T>): T | undefined {
  return result.data!;
}

/**
 * Expect a successful result with proper type narrowing
 *
 * Combines expect assertion with type narrowing in a single call.
 *
 * @param result - The transpile result
 * @returns The data from the successful result
 *
 * @example
 * ```ts
 * const result = converter.convertRequestFromInternal(request);
 * const data = expectSuccess(result);
 * expect(data.messages).toHaveLength(3);
 * ```
 */
export function expectSuccess<T>(result: TranspileResult<T>): T {
  if (!result.success || result.data! === undefined) {
    throw new Error(
      `Expected success with data, but got: ${JSON.stringify({ success: result.success, data: result.data! })}`
    );
  }
  return result.data!;
}

/**
 * Get data from result and assert success
 *
 * Similar to expectSuccess but more flexible - can be used after you've
 * already done an expect assertion.
 *
 * @param result - The transpile result
 * @returns The data from the successful result
 *
 * @example
 * ```ts
 * const result = converter.convertRequestToInternal(request);
 * expect(result.success).toBe(true);
 * const data = getDataAndAssert(result);
 * expect(data.messages).toHaveLength(3);
 * ```
 */
export function getDataAndAssert<T>(result: TranspileResult<T>): T {
  if (!result.success || result.data! === undefined) {
    throw new Error(
      `Expected success with data, but got: ${JSON.stringify({ success: result.success, data: result.data! })}`
    );
  }
  return result.data!;
}
