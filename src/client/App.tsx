import { useState, useEffect } from 'react';
import { Sidebar } from '@client/components/layout/Sidebar';
import { Dashboard } from '@client/components/analytics/Dashboard';
import { RouteManager } from '@client/components/routes/RouteManager';
import { KeyManager } from '@client/components/keys/KeyManager';
import { RoutePlayground } from '@client/components/playground/RoutePlayground';
import { AssetManager } from '@client/components/assets/AssetManager';
import { VendorManager } from '@client/components/vendors/VendorManager';
import { LogExplorer } from '@client/components/logs';
import { SystemSettings } from '@client/components/system/SystemSettings';

// Hash to view mapping
const hashToView: Record<string, string> = {
  '#/': 'dashboard',
  '#/dashboard': 'dashboard',
  '#/routes': 'routes',
  '#/keys': 'keys',
  '#/playground': 'playground',
  '#/assets': 'assets',
  '#/vendors': 'vendors',
  '#/logs': 'logs',
  '#/system': 'system',
  '#/settings': 'system', // Alias for system
};

// View to hash mapping (for reverse lookup)
const viewToHash: Record<string, string> = {
  dashboard: '#/dashboard',
  routes: '#/routes',
  keys: '#/keys',
  playground: '#/playground',
  assets: '#/assets',
  vendors: '#/vendors',
  logs: '#/logs',
  system: '#/system',
  settings: '#/system',
};

function App() {
  const [currentView, setCurrentView] = useState(() => {
    // Initialize from URL hash
    const hash = window.location.hash;
    return hashToView[hash] || 'dashboard';
  });

  // Wrapper to update both state and URL hash
  const handleSetView = (viewOrHash: string) => {
    // If it's already a hash, use it directly
    if (viewOrHash.startsWith('#/')) {
      window.location.hash = viewOrHash;
    } else {
      // Otherwise, look up the hash for this view
      const hash = viewToHash[viewOrHash];
      if (hash) {
        window.location.hash = hash;
      }
    }
  };

  // Sync with URL hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      setCurrentView(hashToView[hash] || 'dashboard');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'routes': return <RouteManager />;
      case 'keys': return <KeyManager />;
      case 'playground': return <RoutePlayground />;
      case 'assets': return <AssetManager />;
      case 'vendors': return <VendorManager />;
      case 'logs': return <LogExplorer />;
      case 'system': return <SystemSettings />;
      default: return <div className="text-center text-gray-500 mt-20">View not implemented</div>;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#050505] text-[#e5e5e5]">
      <Sidebar currentView={currentView} setCurrentView={handleSetView} />
      <main className="flex-1 ml-64 p-8">
        {renderView()}
      </main>
    </div>
  );
}

export default App;