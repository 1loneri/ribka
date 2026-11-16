import {adminSections,selectAdminContent} from './admin-sections.js';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('./admin.css',import.meta.url),'utf8');
export function renderAdminPage(body,{path='/admin'}={}){
 body=selectAdminContent(body,path);
 return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Управление — War1ouss</title><style>'+css+'</style></head><body><div class="admin-shell"><aside class="admin-sidebar"><a class="admin-brand" href="/">W.<small>WAR1OUSS / ADMIN</small></a><nav aria-label="Разделы админ-панели">'+adminSections.map(s=>'<a href="'+s.path+'" '+(s.path===path?'aria-current="page"':'')+'>'+s.label+'</a>').join('')+'</nav><a class="admin-return" href="/">↗ Вернуться на сайт</a></aside><main class="admin-main">'+body+'<footer class="admin-footer">WAR1OUSS / ХОЛОДОС · УПРАВЛЕНИЕ</footer></main></div></body></html>';
}
