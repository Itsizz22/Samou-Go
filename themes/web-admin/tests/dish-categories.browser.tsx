import { createRoot } from 'react-dom/client';
import { DishCategorySettings } from '../src/components/DishCategorySettings';
import '../src/index.css';
createRoot(document.getElementById('root')!).render(<main className="mx-auto max-w-md bg-canvas p-4 text-ink"><DishCategorySettings onSaved={() => {}} /></main>);
