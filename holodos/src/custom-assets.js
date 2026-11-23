import {randomBytes} from 'node:crypto';
import {cosmeticCatalog} from './cosmetics.js';
import {duelCanCatalog,duelCanAssets} from './duel-visuals.js';
import {caseRewardOptions} from './case-catalog.js';
export function createCustomAssets(db,transaction){
 db.exec("CREATE TABLE IF NOT EXISTS uploaded_cosmetics(id TEXT PRIMARY KEY,kind TEXT NOT NULL,label TEXT NOT NULL,target TEXT NOT NULL,mime TEXT NOT NULL,data BLOB NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,actor TEXT NOT NULL,created_at INTEGER NOT NULL)");
 db.exec('CREATE TABLE IF NOT EXISTS deleted_cosmetic_assets(id TEXT PRIMARY KEY)');
 function remove(id){
  transaction(()=>{
   const changed=db.prepare('UPDATE uploaded_cosmetics SET enabled=0 WHERE id=?').run(String(id));
   if(!changed.changes)fail('Файл не найден.');
   db.prepare('INSERT OR IGNORE INTO deleted_cosmetic_assets VALUES(?)').run(String(id));
  });
 }
 const fail=m=>{throw Object.assign(Error(m),{status:400})};
 function register(r){if(!r.enabled)return;const src='/api/cosmetic-assets/'+r.id;if(r.kind==='can'){duelCanCatalog[r.id]=r.label;duelCanAssets[r.id]=src;caseRewardOptions['can-'+r.id]={label:r.label,kind:'Банка для дуэлей',symbol:'can',can:r.id,src};}if(r.kind==='theme'){cosmeticCatalog.theme[r.id]=r.label;caseRewardOptions['theme-'+r.id]={label:r.label,kind:'Цвет сайта',symbol:'theme'};}if(r.kind==='profile'){cosmeticCatalog.profile[r.id]=r.label;caseRewardOptions['profile-'+r.id]={label:r.label,kind:'Оформление профиля',symbol:'profile',src};}}
 for(const r of db.prepare('SELECT * FROM uploaded_cosmetics WHERE enabled=1').all())register(r);
 db.exec('CREATE TABLE IF NOT EXISTS cosmetic_profile_styles(id TEXT PRIMARY KEY,image_opacity INTEGER NOT NULL,stats_opacity INTEGER NOT NULL,gradient TEXT NOT NULL)');
 const styleColumns=new Set(db.prepare('PRAGMA table_info(cosmetic_profile_styles)').all().map(c=>c.name));
 for(const column of ['stats_color','gradient_start','gradient_end','stats_border']){
  if(!styleColumns.has(column))db.exec('ALTER TABLE cosmetic_profile_styles ADD COLUMN '+column+' TEXT');
 }
 const gradients={custom:'Свои два цвета',none:'Без градиента',ice:'Ледяной',violet:'Сиреневый',sunset:'Закат',forest:'Лесной'};
 function styleFields(form){
  const image=Number(form.get('image_opacity')??20),stats=Number(form.get('stats_opacity')??15);
  const gradient=String(form.get('gradient')??'none');
  if(![image,stats].every(x=>Number.isInteger(x)&&x>=0&&x<=100)||!Object.hasOwn(gradients,gradient))fail('Укажи прозрачность от 0 до 100 и выбери градиент.');
  const colors=Object.entries({stats_color:'#101720',gradient_start:'#183453',gradient_end:'#0d172b',stats_border:'#63798b'}).map(([key,fallback])=>{
   const color=String(form.get(key+'_hex')||form.get(key)||fallback).trim();
   if(!/^#[a-f0-9]{6}$/i.test(color))fail('Укажи цвет в формате #RRGGBB.');
   return color.toLowerCase();
  });
  return [100-image,100-stats,gradient,...colors];
 }
 function writeStyle(id,values){
  db.prepare('INSERT OR REPLACE INTO cosmetic_profile_styles(id,image_opacity,stats_opacity,gradient,stats_color,gradient_start,gradient_end,stats_border) VALUES(?,?,?,?,?,?,?,?)').run(id,...values);
 }
 function saveStyle(form){
  const id=String(form.get('id')||'');
  if(!db.prepare("SELECT 1 FROM uploaded_cosmetics WHERE id=? AND kind='profile'").get(id))fail('Фон профиля не найден.');
  writeStyle(id,styleFields(form));
 }
 function styleControls(image=20,stats=15,gradient='none',style={}) {
  const picker=(key,label,fallback)=>{
   const color=/^#[a-f0-9]{6}$/i.test(style[key]||'')?style[key]:fallback;
   return '<label>'+label+'<input type="color" name="'+key+'" value="'+color+'"></label>'+
    '<label>Или HEX<input type="text" name="'+key+'_hex" maxlength="7" pattern="#[0-9a-fA-F]{6}" placeholder="'+color+'"></label>';
  };
  return '<label>Прозрачность картинки (%)<input type="number" name="image_opacity" min="0" max="100" value="'+image+'"></label>'+
   '<label>Прозрачность плашки статистики (%)<input type="number" name="stats_opacity" min="0" max="100" value="'+stats+'"></label>'+
   '<label>Градиент<select name="gradient">'+Object.entries(gradients).map(([key,label])=>'<option value="'+key+'"'+(key===gradient?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+picker('stats_color','Цвет плашки статистики','#101720')+picker('stats_border','Цвет обводки статистики','#63798b')+picker('gradient_start','Первый цвет градиента','#183453')+picker('gradient_end','Второй цвет градиента','#0d172b');
 }
 function list(){return db.prepare('SELECT a.id,a.kind,a.label,a.target,a.mime,a.enabled,s.image_opacity,s.stats_opacity,s.gradient,s.stats_color,s.gradient_start,s.gradient_end,s.stats_border FROM uploaded_cosmetics a LEFT JOIN cosmetic_profile_styles s ON s.id=a.id WHERE NOT EXISTS(SELECT 1 FROM deleted_cosmetic_assets d WHERE d.id=a.id) ORDER BY a.created_at DESC').all().map(r=>({...r,src:'/api/cosmetic-assets/'+r.id}));}
 function media(id){return db.prepare('SELECT mime,data FROM uploaded_cosmetics WHERE id=? AND enabled=1').get(id);}
 async function parse(req){const content=String(req.headers['content-type']||''),match=content.match(/boundary=(?:"([^"]+)"|([^;]+))/i),boundary=match?.[1]||match?.[2];if(!boundary||boundary.length>100)fail('Нужна форма загрузки файла.');let length=0,chunks=[];for await(const chunk of req){const b=Buffer.from(chunk);length+=b.length;if(length>700000)fail('Файл слишком большой (максимум 512 КБ).');chunks.push(b);}const body=Buffer.concat(chunks),sep=Buffer.from('--'+boundary),form=new URLSearchParams();let file=null,start=body.indexOf(sep)+sep.length;while(start>=sep.length){const end=body.indexOf(sep,start);if(end<0)break;const part=body.subarray(start+2,end-2),headerEnd=part.indexOf(Buffer.from('\r\n\r\n'));if(headerEnd>=0){const header=part.subarray(0,headerEnd).toString(),data=part.subarray(headerEnd+4),name=header.match(/name="([^"]+)"/)?.[1];if(name==='file')file={name:header.match(/filename="([^"]*)"/)?.[1]||'',data};else if(name)form.set(name,data.toString('utf8'));}start=end+sep.length;}return {form,file};}
 function upload(form,file,actor){const kind=form.get('kind'),label=String(form.get('label')||'').trim(),target=String(form.get('target')||'');if(!['can','case','profile','theme'].includes(kind)||!label||label.length>60||!file?.data?.length||file.data.length>524288)fail('Проверь тип, название и файл (до 512 КБ).');let mime='image/png';if(kind==='theme'){let data;try{data=JSON.parse(file.data.toString('utf8'))}catch{fail('Для цветовой темы нужен JSON: colors, angle, accent.');}const hex=/^#[a-f0-9]{6}$/i;if(!Array.isArray(data.colors)||data.colors.length<1||data.colors.length>4||!data.colors.every(c=>typeof c==='string'&&hex.test(c))||!Number.isFinite(Number(data.angle??135))||Number(data.angle??135)<0||Number(data.angle??135)>360||!hex.test(String(data.accent||'#b8dfff')))fail('Укажи 1–4 цвета #RRGGBB, угол 0–360 и accent #RRGGBB.');mime='application/json';file={...file,data:Buffer.from(JSON.stringify({colors:data.colors,angle:Number(data.angle??135),accent:data.accent||'#b8dfff'}))};}else if(file.name.toLowerCase().endsWith('.html')&&kind==='profile'){mime='text/html; charset=utf-8';}else{const b=file.data;if(b.length<24||b.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')fail('Для банки и кейса нужен PNG. Для профиля — PNG или HTML.');const w=b.readUInt32BE(16),h=b.readUInt32BE(20);if(w<16||h<16||w>2048||h>2048)fail('Размер PNG — от 16 до 2048 пикселей по каждой стороне.');}if(kind==='case'&&!['donation','twitch','chat','vip','coins','subscriber'].includes(target))fail('Выбери кейс, для которого загружаешь картинку.');const r={id:'custom_'+randomBytes(8).toString('hex'),kind,label,target,mime,data:file.data,enabled:1};const styles=kind==='profile'?styleFields(form):null;
 transaction(()=>{
  db.prepare('INSERT INTO uploaded_cosmetics VALUES(?,?,?,?,?,?,1,?,?)').run(r.id,kind,label,target,mime,file.data,String(actor),Date.now());
  if(styles)writeStyle(r.id,styles);
 });register(r);return {ok:true,id:r.id};}
 function toggle(id,value,actor){if(![0,1].includes(Number(value)))fail('Неверное состояние.');const r=db.prepare('SELECT * FROM uploaded_cosmetics WHERE id=?').get(String(id));if(!r||db.prepare('SELECT 1 FROM deleted_cosmetic_assets WHERE id=?').get(r.id))fail('Файл не найден.');transaction(()=>{db.prepare('UPDATE uploaded_cosmetics SET enabled=? WHERE id=?').run(Number(value),r.id);const reward=(r.kind==='can'?'can-':r.kind==='profile'?'profile-':r.kind==='theme'?'theme-':'')+r.id;db.prepare('INSERT INTO feature_switches VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at').run('reward:'+reward,Number(value),String(actor),Date.now());});if(Number(value))register({...r,enabled:1});return {ok:true};}
 function renderAdmin(escape,csrf){return '<section class="admin-panel" id="asset-uploads"><h2>Свои файлы косметики</h2><p>PNG для банки / изображения кейса. PNG или HTML для оформления профиля. JSON для своих цветов сайта. HTML отображается в отдельном изолированном слое без скриптов и доступа к аккаунту. До 512 КБ. Пример JSON: {"colors":["#0d1420","#291d36"],"angle":135,"accent":"#efb8d8"}.</p><form method="post" action="/asset-upload" enctype="multipart/form-data"><input type="hidden" name="csrf" value="'+escape(csrf)+'"><label>Тип<select name="kind"><option value="can">Банка · новая косметика</option><option value="profile">Оформление профиля</option><option value="theme">Цвета сайта · JSON</option><option value="case">Изображение существующего кейса</option></select></label><label>Название<input name="label" maxlength="60" required></label><label>Кейс (для изображения кейса)<select name="target">'+['donation','twitch','chat','vip','coins','subscriber'].map(id=>'<option>'+id+'</option>').join('')+'</select></label><label>Файл<input name="file" type="file" accept=".png,.html,.json" required></label><details><summary>Оформление фона профиля</summary>'+styleControls()+'</details><button>Загрузить</button></form>'+list().map(r=>'<div class="admin-row"><span>'+escape(r.label)+' · '+escape(r.kind)+'</span><form method="post" action="/asset-toggle"><input type="hidden" name="csrf" value="'+escape(csrf)+'"><input type="hidden" name="id" value="'+r.id+'"><input type="hidden" name="enabled" value="'+(r.enabled?0:1)+'"><button>'+ (r.enabled?'Выключить':'Включить')+'</button></form><form method="post" action="/asset-delete"><input type="hidden" name="csrf" value="'+escape(csrf)+'"><input type="hidden" name="id" value="'+escape(r.id)+'"><button type="submit">Удалить</button></form></div>'+(r.kind==='profile'?'<details><summary>Настроить фон '+escape(r.label)+'</summary><form method="post" action="/asset-profile-style"><input type="hidden" name="csrf" value="'+escape(csrf)+'"><input type="hidden" name="id" value="'+escape(r.id)+'">'+styleControls(100-(r.image_opacity??80),100-(r.stats_opacity??85),r.gradient??'none',r)+'<button>Сохранить оформление</button></form></details>':'')).join('')+'</section>';}
 return {list,media,parse,upload,toggle,remove,saveStyle,renderAdmin};
}