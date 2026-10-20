export const LEVEL_TITLES=[
 {id:'on-air',name:'На связи',level:2},
 {id:'regular',name:'Свой человек',level:5},
 {id:'veteran',name:'Старожил',level:10},
 {id:'old',name:'Олд чата',level:15},
 {id:'legend',name:'Легенда чата',level:20},
] as const;
export function levelTitle(id:unknown,level:number){return LEVEL_TITLES.find(title=>title.id===id&&title.level<=level)??null;}
