import { Theme } from './settings/types';
import { LiveOrderTracking } from './components/generated/LiveOrderTracking';

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

  return <LiveOrderTracking />;
}

export default App;
