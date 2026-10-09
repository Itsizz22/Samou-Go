import { HandoffPage } from './components/HandoffPage';
import { ConnectionNotice } from '@samou-go/api-client';
import { SamouGoCaptain } from './components/generated/SamouGoCaptain';
// %IMPORT_STATEMENT%

function App() {
  if (window.location.pathname.replace(/\/$/, '') === '/handoff') return <HandoffPage />;
  return <><ConnectionNotice /><SamouGoCaptain /></>; // %EXPORT_STATEMENT%
}

export default App;
