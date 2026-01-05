/**
 * Standard API response helpers
 */

export interface ApiResponse<T = any> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

/**
 * Create a success response
 */
export function apiResponse<T = any>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Create an error response
 */
export function apiError(message: string): ApiError {
  return {
    success: false,
    error: message,
  };
}
