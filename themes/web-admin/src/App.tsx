import { useEffect } from 'react';
import { SamouGoAdminDashboard } from './components/generated/SamouGoAdminDashboard';

const ADMIN_DARK_STORAGE_KEY = 'samou-go.admin-dark';

function App() {
  // Apply the stored dark-mode preference on boot. The in-dashboard
  // DarkModeToggle keeps the class + storage in sync afterwards.
  useEffect(() => {
    let dark = false;
    try {
      dark = window.localStorage.getItem(ADMIN_DARK_STORAGE_KEY) === '1';
    } catch {
      /* Private mode — light default. */
    }
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  return <SamouGoAdminDashboard />;
}

export default App;