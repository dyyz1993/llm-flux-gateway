import React, { useState, useEffect } from 'react';
import { Lock, Hexagon, AlertCircle, CheckCircle } from 'lucide-react';
import {
  login,
  setAdminToken,
  setStoredCredentials,
  getStoredCredentials,
  clearStoredCredentials,
} from '@client/services/adminApi';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load stored credentials on mount
  useEffect(() => {
    const stored = getStoredCredentials();
    if (stored && rememberMe) {
      setUsername(stored.username);
      setPassword(stored.password);
    }
  }, [rememberMe]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await login(username, password);

      if (result.success && result.data) {
        // Save token
        setAdminToken(result.data.token);

        // Save credentials if remember me is checked
        if (rememberMe) {
          setStoredCredentials(username, password);
        } else {
          clearStoredCredentials();
        }

        // Redirect to dashboard
        window.location.hash = '#/dashboard';
        window.location.reload();
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-500/20 mb-4">
            <Hexagon className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Flux Gateway</h1>
          <p className="text-gray-500 text-sm">LLM Proxy Engine - Admin Login</p>
        </div>

        {/* Login Form */}
        <div className="bg-[#0a0a0a] border border-[#262626] rounded-2xl p-8 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="text-red-500 w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-red-400 text-sm font-medium">Login Failed</p>
                  <p className="text-red-400/70 text-xs mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Username Field */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-400 mb-2">
                Username
              </label>
              <div className="relative">
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#111] border border-[#262626] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  placeholder="Enter your username"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-400 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 w-5 h-5" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#111] border border-[#262626] rounded-lg pl-12 pr-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center gap-3">
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-[#262626] bg-[#111] text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-0"
              />
              <label htmlFor="remember" className="text-sm text-gray-400 cursor-pointer select-none">
                Remember my credentials
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="mt-6 pt-6 border-t border-[#262626]">
            <div className="flex items-start gap-3">
              <CheckCircle className="text-emerald-500 w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-gray-500">
                  Protected by rate limiting and brute-force protection.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-xs text-gray-600">
            Forgot your credentials? Check your environment configuration.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
