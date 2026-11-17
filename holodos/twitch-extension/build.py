from pathlib import Path
from PIL import Image
import zipfile,io
root=Path(__file__).resolve().parent
site=root.parent/'src/site'
names=['case-'+x+'.webp' for x in ['donation','twitch','chat','vip','coins','subscriber']]+['slot-'+x+'.webp' for x in ['white','green','mango','pink','blue','black','watermelon','yellow','w-edition']]+['duel-can-'+x+'.webp' for x in ['pipeline','pacific','khaotic','violet','badapple']]+['frame-'+x+'.png' for x in ['ultra','original','mango','thorn','assault','ears','jett','clove','shy','fish']]
with zipfile.ZipFile(site/'twitch-panel.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in ['panel.html','panel.css','panel.js']:z.write(root/name,name)
 for name in names:
  im=Image.open(site/name);data=io.BytesIO()
  if name.startswith('case-'):im.thumbnail((512,384))
  elif name.startswith('frame-'):im.thumbnail((256,256))
  im.save(data,format='PNG' if name.endswith('.png') else 'WEBP',**({'optimize':True} if name.endswith('.png') else {'quality':88,'method':6}))
  z.writestr('media/'+name,data.getvalue())
print(site/'twitch-panel.zip',(site/'twitch-panel.zip').stat().st_size,'bytes')
