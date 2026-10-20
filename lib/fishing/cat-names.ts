// Cat names are plain text, never mentions, URLs, commands or arbitrary Unicode.
const forbidden=['хуй','хуе','хуё','пизд','бляд','блять','ебат','ебан','ёбан','ебал','пидор','пидар','педик','ниггер','негрит','жид','чурк','хач','свастик','нацист','гитлер','fuck','shit','bitch','cunt','nigger','nigga','faggot','hitler','nazi'];
const translit:Record<string,string>={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sh',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
const confusables:Record<string,string>={a:'а',b:'в',c:'с',e:'е',h:'н',k:'к',m:'м',o:'о',p:'р',t:'т',x:'х',y:'у'};
export const compactCatName=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[\s_-]+/g,'');
const transliterate=(s:string)=>Array.from(compactCatName(s),c=>translit[c]??c).join('');
export function validateCatName(input:string):{name:string;error:string|null}{
 const name=input.normalize('NFKC').trim().replace(/\s+/g,' ');
 if(!/^[a-zа-яё][a-zа-яё -]{0,18}[a-zа-яё]$/i.test(name))return {name,error:'Имя: 2–20 букв, можно пробел и дефис.'};
 const clean=compactCatName(name),mixed=Array.from(clean,c=>confusables[c]??c).join(''),latin=transliterate(clean);
 if(forbidden.some(term=>clean.includes(term)||mixed.includes(Array.from(term,c=>confusables[c]??c).join(''))||latin.includes(transliterate(term))))return {name,error:'Такое имя нельзя использовать. Выбери другое.'};
 return {name,error:null};
}
export function catNameCandidate(command:string):string|null{
 const [cmd,...args]=command.trim().split(/\s+/);if(!['!кот','!cat'].includes(cmd.toLowerCase())||!args.length)return null;
 if(['купить','buy','новый','new','корм','feed','улучшить','upgrade'].includes(args[0].toLowerCase()))return null;
 return args[0].toLowerCase()==='имя'?args.slice(1).join(' '):args.join(' ');
}
