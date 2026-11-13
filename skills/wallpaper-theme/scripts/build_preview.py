"""Build a portable local wallpaper theme preview from a JSON manifest."""
import argparse
import html
import json
import math
from pathlib import Path

from PIL import Image


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Theme coordinates and motion values must be finite numbers.')
    return value


def build(manifest, output):
    config = json.loads(manifest.read_text(encoding='utf-8-sig'))
    name = config['name']
    if not isinstance(name, str) or not name.strip():
        raise ValueError('name must be nonempty text.')
    region = [number(value) for value in config['region']]
    if len(region) != 4 or not (0 <= region[0] < region[2] <= 1 and 0 <= region[1] < region[3] <= 1):
        raise ValueError('region must be [left, top, right, bottom] within 0..1.')
    scale = number(config.get('object_scale', .09))
    duration = number(config.get('duration', 48))
    forward = number(config.get('forward_degrees', 0))
    motion = config.get('motion', 'float')
    if not 0 < scale <= .5 or duration <= 0 or motion not in ['float', 'heading', 'spin', 'sway']:
        raise ValueError('Use object_scale in (0, .5], positive duration, and float/heading/spin/sway motion.')
    with Image.open(manifest.parent / config['background']) as image:
        background = image.convert('RGB')
    with Image.open(manifest.parent / config['sprite']) as image:
        sprite = image.convert('RGBA')
    alpha = sprite.getchannel('A')
    if not alpha.getbbox() or alpha.getextrema()[0] == 255:
        raise ValueError('sprite must contain visible content and real transparency.')
    packaged = dict(name=name, background='background.webp', sprite='object.png', region=region,
                    object_scale=scale, duration=duration, motion=motion, forward_degrees=forward,
                    width=background.width, height=background.height)
    template = (Path(__file__).resolve().parents[1] / 'assets/preview.html').read_text(encoding='utf-8')
    # JSON is embedded as data, and must not be able to close its script element.
    data = json.dumps(packaged, ensure_ascii=False).replace('<', '\\u003c').replace('&', '\\u0026')
    page = template.replace('__THEME_TITLE__', html.escape(name)).replace('__THEME_JSON__', data)
    output.mkdir(parents=True, exist_ok=False)
    background.save(output / 'background.webp', 'WEBP', quality=90, method=6)
    sprite.save(output / 'object.png', optimize=True)
    (output / 'theme.json').write_text(json.dumps(packaged, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (output / 'index.html').write_text(page, encoding='utf-8')
    print(f'Preview: {(output / "index.html").resolve()}')
    print(f'Background: {background.width} x {background.height}; sprite: {sprite.width} x {sprite.height}')
    print('Design preview only; no desktop files or system settings are accessed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--out', type=Path, required=True, help='A new directory; existing directories are not overwritten.')
    args = parser.parse_args()
    try:
        build(args.manifest.resolve(), args.out.resolve())
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
