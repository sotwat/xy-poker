export type UiGeometry = 'original' | 'angular';

const requested = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('geometry') : null;
export const uiGeometry: UiGeometry = requested === 'original' ? 'original' : 'angular';
