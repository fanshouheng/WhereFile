"""Extract the green-backed space/desert objects into transparent preview sprites."""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent.parent
target = root / 'previews/interface/boats'
target.mkdir(parents=True, exist_ok=True)

for scene, source in [('space', 'object-meteorite'), ('desert', 'object-tornado')]:
    rgb = np.array(Image.open(root / 'output/imagegen' / f'{source}.png').convert('RGB'), dtype=np.float32)
    chroma = rgb[:, :, 1] - np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    foreground = chroma < 24
    distance, labels = cv2.distanceTransformWithLabels(
        (~foreground).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL,
    )
    nearest = rgb[foreground][labels - 1]
    background = np.median(rgb[chroma > 210], axis=0)
    direction = nearest - background
    alpha = np.clip(np.sum((rgb - background) * direction, axis=2)
                    / np.maximum(np.sum(direction * direction, axis=2), 1), 0, 1)
    alpha[foreground] = 1
    alpha[distance > 3] = 0
    alpha[alpha < .025] = 0
    color = np.clip((rgb - (1 - alpha[:, :, None]) * background)
                    / np.maximum(alpha[:, :, None], .01), 0, 255)
    color[:, :, 1] -= np.maximum(0, color[:, :, 1] - np.maximum(color[:, :, 0], color[:, :, 2]))
    color[alpha == 0] = 0
    sprite = Image.fromarray(np.dstack((color, alpha * 255)).round().astype(np.uint8))
    sprite = sprite.crop(sprite.getbbox())
    sprite.thumbnail((344, 344), Image.Resampling.LANCZOS)
    tile = Image.new('RGBA', (384, 384))
    tile.alpha_composite(sprite, ((384 - sprite.width) // 2, (384 - sprite.height) // 2))
    tile.save(target / f'{scene}-cutout.png', optimize=True)
    print(f'Saved {scene}-cutout.png: 384x384, content {tile.getbbox()}')
