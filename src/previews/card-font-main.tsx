import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../i18n';
import { CardFontReview } from './CardFontReview';

createRoot(document.getElementById('root')!).render(
    <I18nProvider manageDocumentMetadata={false}><CardFontReview /></I18nProvider>,
);
