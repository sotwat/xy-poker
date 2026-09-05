import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv } from 'vite';

const settings = loadEnv('production', process.cwd(), 'XYPOKER_');
const fontPack = process.env.XYPOKER_FONT_PACK ?? settings.XYPOKER_FONT_PACK;
if (!fontPack) throw new Error('Set XYPOKER_FONT_PACK to the licensed local font pack before deploying.');
await mkdir('.private', { recursive: true });
await copyFile(path.join(fontPack, 'Y1_Standard_Fonts/Vectura/Y1Vectura.otf'), '.private/vectura.bin');
console.log('Private Vectura renderer prepared (font excluded from Git and public assets).');
