import { applyThemeMode, getStoredThemeMode } from '@samou-go/ui';
import { useEffect } from 'react';
import { SamouGoAdminDashboard } from './components/generated/SamouGoAdminDashboard';

function App() {
  // Apply the stored theme preference on boot. The in-dashboard ThemeToggle
  // keeps the class + storage in sync afterwards.
  useEffect(() => {
    applyThemeMode(getStoredThemeMode());
  }, []);

  return <SamouGoAdminDashboard />;
}

export default App;