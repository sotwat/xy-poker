"""Pack frames rendered from coin-toss.blend (Pillow required)."""
from pathlib import Path
from PIL import Image
import argparse
parser = argparse.ArgumentParser()
parser.add_argument('frames', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
atlas = Image.new('RGBA', (2048, 1536))
for index in range(48):
    atlas.paste(Image.open(args.frames / f'{index + 1:03}.png'), ((index % 8) * 256, (index // 8) * 256))
atlas.save(args.output, quality=88, method=6)
