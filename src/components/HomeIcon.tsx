import { BookOpen, HeartHandshake, Languages, MessageCircle, Palette, UserRound } from 'lucide-react';
import { uiGeometry, type UiGeometry } from '../uiGeometry';

const originalIcons = { skins: Palette, rules: BookOpen, account: UserRound, contact: MessageCircle, language: Languages, support: HeartHandshake };
type HomeIconName = keyof typeof originalIcons;

const angularPaths: Record<HomeIconName, string> = {
    skins: 'M3 16V3H16V6M7 7H21V21H7ZM11 11H17V17H11Z',
    rules: 'M3 4H8L12 7L16 4H21V19H16L12 22L8 19H3ZM12 7V22M6 9H9M6 13H9M15 9H18M15 13H18',
    account: 'M9 3H15V10H9ZM4 21V18L9 13H15L20 18V21Z',
    contact: 'M3 3H21V17H11L5 21V17H3ZM7 8H17M7 12H13',
    language: 'M2 17L7 4L12 17M4 12H10M14 7H22M18 3V7M15 11L22 19M21 7L14 20',
    support: 'M3 5H8L12 9L16 5H21V12L12 21L3 12Z',
};

export function HomeIcon({ name, className, geometry = uiGeometry }: { name: HomeIconName; className?: string; geometry?: UiGeometry }) {
    if (geometry === 'original') {
        const Icon = originalIcons[name];
        return <Icon className={className} aria-hidden="true" />;
    }
    return (
        <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">
            <path d={angularPaths[name]} />
        </svg>
    );
}
