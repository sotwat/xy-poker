import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../i18n';
import { GeometryReview } from './GeometryReview';

createRoot(document.getElementById('root')!).render(
    <I18nProvider manageDocumentMetadata={false}><GeometryReview /></I18nProvider>,
);
