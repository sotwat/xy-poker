"""Render fixed UI lettering without distributing the source font files."""
import argparse
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


FONTS = {
    'marker': ('ToyWriterMarker', 'Y1ToyWriterMarker.otf'),
    'revforge': ('RevForge', 'Y1RevForge.otf'),
    'battle': ('BattleSansSerif', 'Y1BattleSansSerif.otf'),
    'gaen': ('../Y1_Collaboration_Fonts/GaenSansserif', 'Y1GaenSansserif.otf'),
    'nanoline': ('NanoLine', 'Y1NanoLine-RegularDisplay.otf'),
    'vectura': ('Vectura', 'Y1Vectura.otf'),
    'yomiyasu': ('YomiyasuSansSerif', 'Y1YomiyasuSansSerif.otf'),
    'bunan': ('BunanMarker', 'Y1BunanMarker.otf'),
    'macaronium': ('Macaronium', 'Y1Macaronium.otf'),
    'fullmoon': ('FullmoonMarch', 'Y1FullmoonMarch.otf'),
    'pixelation': ('PixelationSerif', 'Y1PixelationSerif.otf'),
}

CARD_RANKS = [str(rank) for rank in range(2, 11)] + ['J', 'Q', 'K', 'A']


def text_image(font_path, text, width, color):
    font = ImageFont.truetype(str(font_path), 600)
    left, top, right, bottom = font.getbbox(text)
    size = int(600 * width / (right - left))
    font = ImageFont.truetype(str(font_path), size)
    left, top, right, bottom = font.getbbox(text)
    canvas = Image.new('RGBA', (right - left + 16, bottom - top + 16))
    ImageDraw.Draw(canvas).text((8 - left, 8 - top), text, font=font, fill=color)
    return canvas


def card_rank_image(font_path, label):
    font = ImageFont.truetype(str(font_path), 180)
    boxes = [font.getbbox(rank) for rank in CARD_RANKS]
    width = max(right - left for left, _, right, _ in boxes) + 16
    top = min(box[1] for box in boxes)
    height = max(box[3] for box in boxes) - top + 16
    if label == 'JOKER':
        return text_image(font_path, label, width - 16, '#ffffff')
    left = font.getbbox(label)[0]
    canvas = Image.new('RGBA', (width, height))
    ImageDraw.Draw(canvas).text((8 - left, 8 - top), label, font=font, fill='#ffffff')
    return canvas


def render(font_root, output):
    output.mkdir(parents=True, exist_ok=True)
    for variant, (folder, filename) in FONTS.items():
        font = font_root / 'Y1_Standard_Fonts' / folder / filename
        assets = {
            'logo': ([('XY', 680), ('POKER', 850)], '#fff1a0', 24),
            'wordmark': ([('XY POKER', 880)], '#fff1a0', 0),
            'ai': ([('AI', 370), ('MATCH', 700)], '#fff183', 40),
            'online': ([('ONLINE', 830), ('MATCH', 710)], '#ffffff', 28),
            'rating-label': ([('RATING', 680)], '#c9c3d7', 0),
        }
        for name, (lines, color, gap) in assets.items():
            rendered = [text_image(font, text, width, color) for text, width in lines]
            width = max(line.width for line in rendered)
            height = sum(line.height for line in rendered) + gap * (len(rendered) - 1)
            canvas = Image.new('RGBA', (width, height))
            y = 0
            for line in rendered:
                canvas.alpha_composite(line, ((width - line.width) // 2, y))
                y += line.height + gap
            canvas.save(output / f'{variant}-{name}.png', optimize=True)

        label_font = ImageFont.truetype(str(font), 180)
        labels = {
            name: label_font.getbbox(name.upper())
            for name in ('skins', 'rules', 'account', 'contact')
        }
        width = max(right - left for left, _, right, _ in labels.values()) + 16
        top = min(box[1] for box in labels.values())
        height = max(box[3] for box in labels.values()) - top + 16
        for name, (left, _, right, _) in labels.items():
            canvas = Image.new('RGBA', (width, height))
            ImageDraw.Draw(canvas).text(((width - (right - left)) / 2 - left, 8 - top), name.upper(), font=label_font, fill='#ffe878')
            canvas.save(output / f'{variant}-{name}.png', optimize=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('font_pack', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'src/assets/lettering')
    content = parser.add_mutually_exclusive_group()
    content.add_argument('--rating')
    content.add_argument('--text')
    content.add_argument('--card-rank', choices=[*CARD_RANKS, 'JOKER'])
    parser.add_argument('--variant', choices=FONTS, default='vectura')
    args = parser.parse_args()
    if args.rating is not None or args.text is not None or args.card_rank is not None:
        if args.rating is not None and not re.fullmatch(r'-?\d{1,6}', args.rating):
            parser.error('Rating must be an integer with at most six digits.')
        if args.text is not None and (not re.fullmatch(r'[ -~]{1,64}', args.text) or not any(c.isalnum() for c in args.text)):
            parser.error('Text must contain 1–64 printable ASCII characters and a letter or number.')
        folder, filename = FONTS[args.variant]
        font = args.font_pack / 'Y1_Standard_Fonts' / folder / filename
        if args.card_rank is not None:
            rendered = card_rank_image(font, args.card_rank)
        else:
            value = args.rating if args.rating is not None else args.text
            color = '#fff4a1' if args.rating is not None else '#ffffff'
            rendered = text_image(font, value, 600, color)
        rendered.save(sys.stdout.buffer, format='PNG')
    else:
        render(args.font_pack, args.output)
