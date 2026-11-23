from pathlib import Path
from PIL import Image
import zipfile,io
root=Path(__file__).resolve().parent
site=root.parent/'src/site'
names=['case-'+x+'.webp' for x in ['donation','twitch','chat','vip','coins','subscriber']]+['slot-'+x+'.webp' for x in ['white','green','mango','pink','blue','black','watermelon','yellow','w-edition']]+['duel-can-'+x+'.webp' for x in ['peach','berry','pipeline','pacific','khaotic','violet','badapple']]+['frame-'+x+'.png' for x in ['gta6','ultra','original','mango','thorn','assault','ears','jett','clove','shy','fish','throne','cats','hat','angel','sims-green','sims-red']]
with zipfile.ZipFile(site/'twitch-panel.zip','w',zipfile.ZIP_DEFLATED) as z:
 for name in ['panel.html','panel.js','catalog.json']:z.write(root/name,name)
 z.writestr('panel.css',(root/'panel.css').read_text()+'\n'+(site/'cosmetic-titles.css').read_text().replace('/assets/monocraft.woff','media/monocraft.woff'))
 for font in ['dela-gothic-one.woff','dela-gothic-one-LICENSE.txt']:z.write(site/font,'media/'+font)
 z.write(site/'monocraft.woff','media/monocraft.woff')
 z.write(site/'Monocraft-LICENSE.txt','media/Monocraft-LICENSE.txt')
 for name in ['profile-fogcat.webp','profile-chinese.webp','profile-redangel.webp','sims-red-filter.svg']:z.write(site/name,'media/'+name)
 for name in names+['duel-can-peach-real.webp','duel-can-berry-real.webp','duel-can-rehab.webp','duel-can-strawberry.webp','slot-w-edition-v2.webp']:
  source_name={'duel-can-peach.webp':'duel-can-rehab.webp','duel-can-peach-real.webp':'duel-can-rehab.webp','duel-can-berry.webp':'duel-can-strawberry.webp','duel-can-berry-real.webp':'duel-can-strawberry.webp','slot-w-edition.webp':'slot-w-edition-v2.webp'}.get(name,name)
  im=Image.open(site/source_name);data=io.BytesIO()
  if name.startswith('case-'):im.thumbnail((512,384))
  elif name.startswith('frame-'):im.thumbnail((256,256))
  im.save(data,format='PNG' if name.endswith('.png') else 'WEBP',**({'optimize':True} if name.endswith('.png') else {'quality':88,'method':6}))
  z.writestr('media/'+name,data.getvalue())
print(site/'twitch-panel.zip',(site/'twitch-panel.zip').stat().st_size,'bytes')
