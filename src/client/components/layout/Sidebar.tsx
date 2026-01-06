import React from 'react';
import {
  LayoutDashboard,
  Waypoints,
  ScrollText,
  FlaskConical,
  Wallet,
  Server,
  Key,
  Settings,
  Hexagon,
  LogOut,
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, onLogout }) => {
  const navItems = [
    { id: 'dashboard', label: 'Analytics', icon: LayoutDashboard },
    { id: 'routes', label: 'Route Flux', icon: Waypoints },
    { id: 'logs', label: 'Logs', icon: ScrollText },
    { id: 'playground', label: 'Playground', icon: FlaskConical },
    { id: 'assets', label: 'Assets', icon: Wallet },
    { id: 'vendors', label: 'Vendors', icon: Server },
    { id: 'keys', label: 'Access Keys', icon: Key },
    { id: 'settings', label: 'System', icon: Settings },
  ];

  return (
    <div className="w-64 h-screen bg-[#0a0a0a] border-r border-[#262626] flex flex-col fixed left-0 top-0 z-50">
      <div className="p-6 flex items-center gap-3 border-b border-[#262626]">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Hexagon className="text-white w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Flux Gateway</h1>
          <p className="text-xs text-gray-500">LLM Proxy Engine</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20'
                  : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-gray-500'}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#262626] space-y-3">
        <div className="bg-[#111] rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Service Status</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-sm font-mono text-emerald-500">Operational</span>
          </div>
        </div>

        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20 transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        )}
      </div>
    </div>
  );
};