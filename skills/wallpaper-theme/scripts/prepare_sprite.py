"""Prepare a transparent square sprite; optional saturated green/magenta key."""
import argparse
from pathlib import Path

from PIL import Image


def remove_key(image, key, despill):
    import cv2
    import numpy as np

    rgb = np.asarray(image.convert('RGB'), dtype=np.float32)
    chroma = (rgb[:, :, 1] - np.maximum(rgb[:, :, 0], rgb[:, :, 2]) if key == 'green'
              else np.minimum(rgb[:, :, 0], rgb[:, :, 2]) - rgb[:, :, 1])
    foreground = chroma < 24
    background_pixels = rgb[chroma > 180]
    if not foreground.any() or len(background_pixels) < rgb.shape[0] * rgb.shape[1] * .05:
        raise ValueError('No usable foreground or saturated key background; use a mask instead.')
    background = np.median(background_pixels, axis=0)
    distance, labels = cv2.distanceTransformWithLabels(
        (~foreground).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    nearest = rgb[foreground][labels - 1]
    direction = nearest - background
    alpha = np.clip(np.sum((rgb - background) * direction, axis=2)
                    / np.maximum(np.sum(direction * direction, axis=2), 1), 0, 1)
    alpha[foreground] = 1
    alpha[distance > 3] = 0
    alpha[alpha < .025] = 0
    color = np.clip((rgb - (1 - alpha[:, :, None]) * background)
                    / np.maximum(alpha[:, :, None], .01), 0, 255)
    if despill:
        if key == 'green':
            color[:, :, 1] -= np.maximum(0, color[:, :, 1] - np.maximum(color[:, :, 0], color[:, :, 2]))
        else:
            spill = np.maximum(0, np.minimum(color[:, :, 0], color[:, :, 2]) - color[:, :, 1])
            color[:, :, 0] -= spill
            color[:, :, 2] -= spill
    color[alpha == 0] = 0
    return Image.fromarray(np.dstack((color, alpha * 255)).round().astype(np.uint8))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--key', choices=['green', 'magenta'])
    parser.add_argument('--despill', action='store_true', help='Only if the object has no key-colored materials.')
    parser.add_argument('--size', type=int, default=384)
    parser.add_argument('--padding', type=float, default=.08, help='Transparent margin on each side, fraction of tile.')
    args = parser.parse_args()
    review_path = args.out.with_name(args.out.stem + '-edges.png')
    if args.out.suffix.lower() != '.png' or args.size < 16 or not 0 <= args.padding < .45:
        parser.error('Use PNG output, size >= 16, and padding in [0, .45).')
    if args.despill and not args.key:
        parser.error('--despill requires --key.')
    if args.out.exists() or review_path.exists():
        parser.error('Output exists; choose a new path.')
    with Image.open(args.source) as source:
        sprite = remove_key(source, args.key, args.despill) if args.key else source.convert('RGBA')
    alpha = sprite.getchannel('A')
    bounds = alpha.getbbox()
    if not bounds or alpha.getextrema()[0] == 255:
        parser.error('Expected a nonempty transparent object. For opaque input specify --key or provide a real mask.')
    sprite = sprite.crop(bounds)
    content_size = round(args.size * (1 - 2 * args.padding))
    sprite.thumbnail((content_size, content_size), Image.Resampling.LANCZOS)
    tile = Image.new('RGBA', (args.size, args.size))
    tile.alpha_composite(sprite, ((args.size - sprite.width) // 2, (args.size - sprite.height) // 2))
    review = Image.new('RGB', (args.size * 2, args.size))
    for index, color in enumerate(['#ffffff', '#18212b']):
        backing = Image.new('RGBA', tile.size, color)
        backing.alpha_composite(tile)
        review.paste(backing.convert('RGB'), (index * args.size, 0))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    tile.save(args.out, optimize=True)
    review.save(review_path)
    print(f'Sprite: {args.out.resolve()} ({args.size} x {args.size})')
    print(f'Alpha content bounds: {tile.getchannel("A").getbbox()}')
    print(f'White/dark edge review: {review_path.resolve()}')


if __name__ == '__main__':
    main()
