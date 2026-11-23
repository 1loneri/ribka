const gradients={
 ice:'linear-gradient(145deg,#183453,#0d172b)',violet:'linear-gradient(145deg,#462a61,#181326)',sunset:'linear-gradient(145deg,#5a2850,#754638)',forest:'linear-gradient(145deg,#253c30,#111d21)'
};
const isHex=value=>/^#[a-f0-9]{6}$/i.test(value);
for(const editor of document.querySelectorAll('[data-profile-style-editor]')){
 const form=editor.closest('form');
 const fields=form.elements;
 const art=editor.querySelector('[data-profile-art]');
 const stats=editor.querySelector('[data-profile-stats]');
 const card=editor.querySelector('.profile-style-card');
 const keys=['stats_color','stats_border','stats_text','gradient_start','gradient_end'];
 const color=key=>isHex(fields[key+'_hex'].value)?fields[key+'_hex'].value:fields[key].value;
 function paint(){
  const mode=fields.gradient.value;
  editor.querySelector('[data-custom-gradient]').hidden=mode!=='custom';
  card.style.backgroundImage=mode==='custom'?'linear-gradient(145deg,'+color('gradient_start')+','+color('gradient_end')+')':gradients[mode]||'none';
  art.style.opacity=String(1-fields.image_opacity.value/100);
  stats.style.backgroundColor=color('stats_color')+Math.round((100-fields.stats_opacity.value)*2.55).toString(16).padStart(2,'0');
  stats.style.borderColor=color('stats_border');
  stats.style.color=color('stats_text');
  for(const output of editor.querySelectorAll('[data-opacity-for]'))output.value=fields[output.dataset.opacityFor].value+'%';
 }
 for(const key of keys){
  fields[key].addEventListener('input',()=>{fields[key+'_hex'].value=fields[key].value;});
  fields[key+'_hex'].addEventListener('input',()=>{if(isHex(fields[key+'_hex'].value))fields[key].value=fields[key+'_hex'].value;});
 }
 editor.addEventListener('input',paint);
 editor.addEventListener('change',paint);
 const upload=editor.closest('[data-upload-profile-style]');
 if(upload){
  let objectUrl='';
  function syncType(){upload.hidden=fields.kind.value!=='profile';}
  fields.kind.addEventListener('change',syncType);
  fields.file.addEventListener('change',()=>{
   if(objectUrl)URL.revokeObjectURL(objectUrl);
   const file=fields.file.files[0];
   art.replaceChildren();
   if(!file||!/\.(png|html)$/i.test(file.name))return;
   const isFrame=file.name.toLowerCase().endsWith('.html');
   const layer=document.createElement(isFrame?'iframe':'img');
   if(isFrame){layer.setAttribute('sandbox','');layer.title='Фон профиля';}else layer.alt='';
   objectUrl=URL.createObjectURL(file);layer.src=objectUrl;art.append(layer);
  });
  syncType();
 }
 paint();
}
