import { useI18n } from '../i18n';

export function PremiumBadge() {
    const { t } = useI18n();
    return (
        <span
            title={t('premium.member')}
            aria-label={t('premium.member')}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '1px 5px',
                border: '1px solid currentColor',
                borderRadius: '999px',
                fontSize: '9px',
                fontWeight: 700,
                lineHeight: 1.4,
                letterSpacing: '0.04em',
                verticalAlign: 'middle',
            }}
        >
            PRO
        </span>
    );
}
