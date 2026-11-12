"""Cut the generated magenta-backed boat into a clean, high-resolution sprite."""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parent.parent
source = root / 'output/imagegen/boat.png'
target = root / 'assets/boat-hd.png'
rgb = np.array(Image.open(source).convert('RGB'), dtype=np.float32)
chroma = np.minimum(rgb[:, :, 0], rgb[:, :, 2]) - rgb[:, :, 1]
foreground = chroma < 24

# Resolve antialiased pixels against the closest solid boat color. This also
# removes the magenta spill without eroding the narrow ropes and sail edges.
distance, labels = cv2.distanceTransformWithLabels(
    (~foreground).astype(np.uint8), cv2.DIST_L2, 5,
    labelType=cv2.DIST_LABEL_PIXEL,
)
nearest_color = rgb[foreground][labels - 1]
background = np.median(rgb[chroma > 210], axis=0)
direction = nearest_color - background
alpha = np.clip(
    np.sum((rgb - background) * direction, axis=2)
    / np.maximum(np.sum(direction * direction, axis=2), 1), 0, 1,
)
alpha[foreground] = 1
alpha[distance > 3] = 0
alpha[alpha < .025] = 0
unmixed = np.clip(
    (rgb - (1 - alpha[:, :, None]) * background)
    / np.maximum(alpha[:, :, None], .01), 0, 255,
)
# Magenta reflected onto fine rigging can survive the alpha calculation.
# The requested boat has no pink materials, so remove that residual chroma.
spill = np.maximum(0, np.minimum(unmixed[:, :, 0], unmixed[:, :, 2]) - unmixed[:, :, 1])
unmixed[:, :, 0] -= spill
unmixed[:, :, 2] -= spill
unmixed[alpha == 0] = 0
rgba = np.dstack((unmixed, alpha * 255)).round().astype(np.uint8)
sprite = Image.fromarray(rgba)
sprite.save(target, optimize=True)

preview = Image.new('RGBA', sprite.size, '#56c8cb')
preview.alpha_composite(sprite)
preview.convert('RGB').save(root / 'output/imagegen/boat-cutout-preview.png')
print(f'Saved {target}; size={sprite.size}; content bounds={sprite.getbbox()}')
