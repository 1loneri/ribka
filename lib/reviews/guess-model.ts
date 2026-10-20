import {rankGroups,ranks} from './model';
export const GUESS_RANKS=[...rankGroups.map(([id,label,color],i)=>({id,label,color,image:'/valorant/ranks/'+id+'-1.png',number:i+1})),{id:'radiant',label:'Радиант',color:'#f0dea0',image:'/valorant/ranks/radiant.png',number:9}];
export const guessTier=(rank:string)=>GUESS_RANKS.find(choice=>choice.id===rank.split('-')[0])?.id??null;
export function guessCommand(text:string){
 const match=/^!ранг\s+([^\s]+)\s*$/iu.exec(text.trim());if(!match)return null;
 const value=match[1].toLowerCase(),aliases:Record<string,string>={железо:'iron',бронза:'bronze',серебро:'silver',золото:'gold',платина:'platinum',алмаз:'diamond',асцендант:'ascendant',асцендент:'ascendant',расцвет:'ascendant',бессмертный:'immortal',иммортал:'immortal',радиант:'radiant'};
 return GUESS_RANKS.find(rank=>rank.id===(aliases[value]??value)||String(rank.number)===value)?.id??null;
}
export const guessAnswer=(id:string)=>{const rank=ranks.find(rank=>rank.id===id);return rank&&rank.id!=='unrated'?{id:rank.id,label:rank.label,image:rank.image,color:rank.color}:null;};
