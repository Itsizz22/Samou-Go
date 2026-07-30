import { Theme } from './settings/types';
import { CartCheckoutSummary } from './components/generated/CartCheckoutSummary';

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

  return <CartCheckoutSummary />;
}

export default App;
