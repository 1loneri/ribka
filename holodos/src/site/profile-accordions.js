/* Native details preserve keyboard support and stay closed until requested. */
(()=>{
 'use strict';
 const memory=new Map(),sections=[['orders','.profile-orders','Заявки и выдачи'],['openings','#chat-case-history','Мои открытия'],['cosmetics','.profile-frames','Моя косметика']];
 const key=node=>node.dataset.accordionOwner+':'+node.dataset.profileAccordion;
 function save(node){const id=key(node);memory.set(id,node.open);try{sessionStorage.setItem('holodos-profile-accordion:'+id,node.open?'open':'closed')}catch{}}
 function remember(){for(const node of document.querySelectorAll('#profile-content details[data-profile-accordion]'))save(node);}
 function decorate(){const host=document.getElementById('profile-content'),owner=state.me?.authenticated?String(state.me.player.id):'';if(!host||!owner)return;for(const [id,selector,label]of sections){const content=host.querySelector(selector);if(!content||content.closest('details[data-profile-accordion]'))continue;const details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');details.className='profile-accordion';details.dataset.profileAccordion=id;details.dataset.accordionOwner=owner;summary.textContent=label;body.className='profile-section-body';const stateKey=owner+':'+id;let open=memory.get(stateKey);if(open===undefined)try{open=sessionStorage.getItem('holodos-profile-accordion:'+stateKey)==='open'}catch{}details.open=!!open;content.querySelector(':scope>h3')?.remove();content.replaceWith(details);body.append(content);details.append(summary,body);}}
 const original=renderProfile;renderProfile=function(){remember();original();decorate();};
 document.addEventListener('toggle',event=>{if(event.target.matches?.('#profile-content details[data-profile-accordion]'))save(event.target);},true);decorate();
})();
