"""Extract eight upright headings in screen-clockwise order from the generated sheet."""
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parent.parent
rgb=np.array(Image.open(root/'output/imagegen/boat-directions.png').convert('RGB'),dtype=np.float32)
chroma=np.minimum(rgb[:,:,0],rgb[:,:,2])-rgb[:,:,1]
foreground=chroma<24
distance,labels=cv2.distanceTransformWithLabels((~foreground).astype(np.uint8),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
nearest=rgb[foreground][labels-1]
bg=np.median(rgb[chroma>210],axis=0)
direction=nearest-bg
alpha=np.clip(np.sum((rgb-bg)*direction,axis=2)/np.maximum(np.sum(direction*direction,axis=2),1),0,1)
alpha[foreground]=1
alpha[distance>3]=0
alpha[alpha<.04]=0
color=np.clip((rgb-(1-alpha[:,:,None])*bg)/np.maximum(alpha[:,:,None],.01),0,255)
spill=np.maximum(0,np.minimum(color[:,:,0],color[:,:,2])-color[:,:,1]);color[:,:,0]-=spill;color[:,:,2]-=spill
color[alpha==0]=0
sheet=Image.fromarray(np.dstack((color,alpha*255)).round().astype(np.uint8))
w,h=sheet.size
atlas=Image.new('RGBA',(256*8,256))
preview=Image.new('RGB',(256*4,256*2),'#31b9c6')
for i in range(8):
    cell=sheet.crop((i%4*w//4,i//4*h//2,(i%4+1)*w//4,(i//4+1)*h//2))
    box=cell.getbbox();assert box and box[0]>0 and box[1]>0
    crop=cell.crop(box)
    scale=210/(h/2*.78)
    crop=crop.resize((round(crop.width*scale),round(crop.height*scale)),Image.Resampling.LANCZOS)
    tile=Image.new('RGBA',(256,256));tile.alpha_composite(crop,((256-crop.width)//2,232-crop.height))
    atlas.alpha_composite(tile,(i*256,0));preview.paste(tile,(i%4*256,i//4*256),tile)
atlas.save(root/'assets/boat-directions.png',optimize=True)
preview.save(root/'output/imagegen/boat-directions-preview.png')
print('Saved 8 upright alpha sprites; each tile 256x256')
