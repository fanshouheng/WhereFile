"""Derive scene assets locally from the user-supplied reference. No remote services."""
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1])
original = cv2.imread(str(source))
scene = original[:886].copy()

def patch(rect, src=None):
    x, y, w, h = rect
    # This clean, open-water patch contains no gulls, boats or reefs.
    sample = cv2.resize(original[0:130,750:1060], (w,h))
    mask = np.zeros((h, w), np.uint8)
    mask[3:-3,3:-3] = 255
    scene[:] = cv2.seamlessClone(sample, scene, mask, (x+w//2,y+h//2), cv2.NORMAL_CLONE)

# Remove the stationary boats, their labels, shadows and long wakes.
patch((801,145,255,160),(1025,10))
patch((1160,345,290,150),(900,610))
# Remove the fixed gulls; the runtime renders birds on independent paths.
for rect, src in [((1080,62,55,47),(1010,60)), ((1135,198,81,44),(1000,180)),
                  ((1360,278,62,70),(1260,270)), ((618,415,72,37),(650,370)),
                  ((708,485,83,52),(850,450)), ((1028,450,63,56),(950,465)),
                  ((1304,580,69,46),(1200,560)), ((1425,713,87,55),(1310,710))]:
    patch(rect,src)

# A narrow crop removes the original desktop icons. Keep the reference's painterly coast.
scene = scene[:,115:]
Image.fromarray(cv2.cvtColor(scene,cv2.COLOR_BGR2RGB)).save(root/'assets/coast.webp',quality=95)

# The boat is cut out at its original silhouette, with soft antialiased edges.
boat = Image.open(source).convert('RGBA').crop((820,150,920,250))
mask = Image.new('L',(400,400))
points = [(45,16),(48,19),(60,22),(59,25),(48,24),(47,29),(55,36),(67,47),
          (74,49),(74,65),(82,73),(87,83),(88,90),(84,96),(73,100),(59,99),
          (45,94),(33,85),(23,71),(18,58),(17,49),(22,45),(29,44),(33,36),(43,28)]
ImageDraw.Draw(mask).polygon([(x*4,y*4) for x,y in points],fill=255)
mask=mask.resize((100,100),Image.Resampling.LANCZOS)
boat.putalpha(mask)
boat.save(root/'assets/boat.png')
print('Prepared coast.webp and boat.png')
