import { Theme } from './settings/types';
import { SamouGoHome } from './components/generated/SamouGoHome';
// %IMPORT_STATEMENT

let theme: Theme = 'light';

function App() {
  function setTheme(theme: Theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  setTheme(theme);

  return <SamouGoHome />; // %EXPORT_STATEMENT%
}

export default App;
