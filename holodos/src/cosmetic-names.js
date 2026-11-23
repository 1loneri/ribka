export function createCosmeticNames(db,transaction,groups,rewards){
 db.exec('CREATE TABLE IF NOT EXISTS cosmetic_names(kind TEXT NOT NULL,id TEXT NOT NULL,label TEXT NOT NULL,PRIMARY KEY(kind,id))');
 const kinds={frame:'Рамки',can:'Банки',title:'Титулы',name_color:'Ники',theme:'Темы сайта',profile:'Фоны профиля',highlight:'Выделения',effect:'Эффекты'};
 const reserved=new Set(['moderator','administrator','tester']);
 const allowed=(kind,id)=>Object.hasOwn(groups,kind)&&!db.prepare('SELECT 1 FROM deleted_cosmetic_assets WHERE id=?').get(id)&&!(kind==='title'&&reserved.has(id))&&
  (Object.hasOwn(groups[kind],id)||!!db.prepare("SELECT 1 FROM uploaded_cosmetics WHERE id=? AND kind=?").get(id,kind));
 function apply(kind,id,label){
  if(Object.hasOwn(groups[kind],id))groups[kind][id]=label;
  const reward=rewards[kind+'-'+id];
  if(reward)reward.label=label;
 }
 for(const {kind,id,label} of db.prepare('SELECT kind,id,label FROM cosmetic_names').all()){
  if(allowed(kind,id))apply(kind,id,label);
 }
 function save(form){
  const kind=String(form.get('kind')||''),id=String(form.get('id')||''),label=String(form.get('label')||'').trim();
  if(!allowed(kind,id)||!label||label.length>60||/[\u0000-\u001f\u007f]/.test(label))throw Object.assign(Error('Выбери предмет и введи название от 1 до 60 символов.'),{status:400});
  transaction(()=>{
   db.prepare('INSERT INTO cosmetic_names VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET label=excluded.label').run(kind,id,label);
   db.prepare('UPDATE uploaded_cosmetics SET label=? WHERE id=? AND kind=?').run(label,id,kind);
   if(kind==='title')db.prepare("UPDATE cosmetic_profiles SET title=? WHERE player_id IN (SELECT player_id FROM cosmetic_equipped WHERE kind='title' AND item_id=?)").run(label,id);
  });
  apply(kind,id,label);
 }
 function render(escape,csrf){
  const uploads=db.prepare('SELECT kind,id,label FROM uploaded_cosmetics WHERE kind!=?').all('case');
  return '<section class="admin-panel" id="cosmetic-names"><h2>Названия косметики</h2>'+Object.entries(kinds).map(([kind,title])=>{
   const items=new Map(Object.entries(groups[kind]));
   for(const asset of uploads)if(asset.kind===kind)items.set(asset.id,asset.label);
   return '<details><summary>'+escape(title)+'</summary>'+[...items].filter(([id])=>allowed(kind,id)).map(([id,label])=>
    '<form method="post" action="/cosmetic-name-save"><input type="hidden" name="csrf" value="'+escape(csrf)+'"><input type="hidden" name="kind" value="'+escape(kind)+'"><input type="hidden" name="id" value="'+escape(id)+'"><label>'+escape(label)+'<input name="label" value="'+escape(label)+'" maxlength="60" required></label><button>Сохранить название</button></form>'
   ).join('')+'</details>';
  }).join('')+'</section>';
 }
 return {save,render};
}
