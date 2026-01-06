/**
 * Admin API Service
 *
 * Handles authenticated API requests to the backend.
 * Automatically includes admin token in Authorization header.
 */

const ADMIN_TOKEN_KEY = 'admin_token';
const ADMIN_CREDENTIALS_KEY = 'admin_credentials'; // For remembering username/password

/**
 * Get the stored admin token
 */
export function getAdminToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

/**
 * Set the admin token
 */
export function setAdminToken(token: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

/**
 * Clear the admin token
 */
export function clearAdminToken(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!getAdminToken();
}

/**
 * Get stored credentials (username/password for auto-fill)
 */
export interface StoredCredentials {
  username: string;
  password: string;
}

export function getStoredCredentials(): StoredCredentials | null {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem(ADMIN_CREDENTIALS_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Store credentials for auto-fill
 */
export function setStoredCredentials(username: string, password: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ADMIN_CREDENTIALS_KEY, JSON.stringify({ username, password }));
}

/**
 * Clear stored credentials
 */
export function clearStoredCredentials(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(ADMIN_CREDENTIALS_KEY);
}

/**
 * Login API call
 */
export interface LoginResponse {
  success: boolean;
  data?: {
    token: string;
    expiresIn: number;
  };
  error?: string;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json();

  if (response.ok && data.success) {
    return { success: true, data: data.data };
  }

  return {
    success: false,
    error: data.error || 'Login failed',
  };
}

/**
 * Logout API call
 */
export async function logout(): Promise<void> {
  const token = getAdminToken();
  if (!token) return;

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
  } catch (error) {
    console.error('Logout error:', error);
  }

  clearAdminToken();
  window.location.hash = '#/login';
}

/**
 * Verify current session
 */
export interface SessionInfo {
  success: boolean;
  data?: {
    authenticated: boolean;
    createdAt: number;
    expiresAt: number;
  };
  error?: string;
}

export async function verifySession(): Promise<SessionInfo> {
  const token = getAdminToken();
  if (!token) {
    return { success: false, error: 'No token' };
  }

  const response = await fetch('/api/auth/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (response.ok && data.success) {
    return { success: true, data: data.data };
  }

  // Token is invalid, clear it
  clearAdminToken();
  return { success: false, error: data.error || 'Invalid session' };
}

/**
 * Make an authenticated API request
 *
 * @param url - API endpoint URL
 * @param options - Fetch options
 * @returns Promise with response data
 * @throws Error if not authenticated or request fails
 */
export async function adminFetch<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const token = getAdminToken();

  if (!token) {
    // Not authenticated, redirect to login
    window.location.hash = '#/login';
    throw new Error('Not authenticated');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options?.headers,
    },
  });

  // Handle 401 Unauthorized - token expired
  if (response.status === 401) {
    clearAdminToken();
    window.location.hash = '#/login';
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

/**
 * Wrapper for GET requests
 */
export async function adminGet<T = any>(url: string): Promise<T> {
  return adminFetch<T>(url, { method: 'GET' });
}

/**
 * Wrapper for POST requests
 */
export async function adminPost<T = any>(url: string, data?: any): Promise<T> {
  return adminFetch<T>(url, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Wrapper for PUT requests
 */
export async function adminPut<T = any>(url: string, data?: any): Promise<T> {
  return adminFetch<T>(url, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Wrapper for DELETE requests
 */
export async function adminDelete<T = any>(url: string): Promise<T> {
  return adminFetch<T>(url, { method: 'DELETE' });
}
