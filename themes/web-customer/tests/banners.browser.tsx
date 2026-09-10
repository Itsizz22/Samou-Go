import { LanguageProvider } from '@samou-go/ui';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { setToken } from '@samou-go/api-client';
import { PromoBannerSlider } from '../src/components/PromoBannerSlider';
import { BannerSettings } from '../../web-admin/src/components/BannerSettings';
import '../src/index.css';
setToken('banner-fixture-only');
createRoot(document.getElementById('root')!).render(<LanguageProvider><MemoryRouter><Routes><Route path="/" element={<><PromoBannerSlider /><PromoBannerSlider kind="product" /><BannerSettings /></>} /><Route path="/stores/:storeId" element={<h1>صفحة المطعم المقصود</h1>} /></Routes></MemoryRouter></LanguageProvider>);
