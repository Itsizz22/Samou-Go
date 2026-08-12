import { Theme } from './settings/types';
import { SamouGoAdminDashboard } from './components/generated/SamouGoAdminDashboard';

const theme: Theme = 'light';

function App() {
  function setTheme(theme: Theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  setTheme(theme);

  return <SamouGoAdminDashboard />;
}

export default App;
