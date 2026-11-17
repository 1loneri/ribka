export function titlePreview(escape,id,label,{login='пример',nameStyle='aurora'}={}){
 return '<span class="admin-title-preview"><b class="admin-preview-name" data-name-style="'+escape(nameStyle)+'">@'+escape(login)+'</b><span class="player-cosmetic-title" data-title="'+escape(id)+'">'+escape(label)+'</span></span>';
}
