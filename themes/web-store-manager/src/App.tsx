import { Theme } from './settings/types';
import { SamouGoStoreManager } from './components/generated/SamouGoStoreManager';
// %IMPORT_STATEMENT%

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

  return <SamouGoStoreManager />; // %EXPORT_STATEMENT%
}

export default App;