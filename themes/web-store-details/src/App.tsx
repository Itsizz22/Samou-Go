import { Theme } from './settings/types';
import { StoreDetailsMenu } from './components/generated/StoreDetailsMenu';

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

  return <StoreDetailsMenu />;
}

export default App;
