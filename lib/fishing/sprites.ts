export const spriteNames=['Золотой карп','Щука','Окунь','Радужная форель','Сардина','Акула','Удильщик','VOID-рыба'];
const itemSprites:Record<string,number>={lake_carp:0,lake_golden:0,lake_pike:1,lake_perch:2,lake_trout:3,lake_tench:2,lake_catfish:1,sea_sardine:4,sea_shark:5,sea_puffer:2,deep_angler:6,deep_eel:1,deep_monster:6,deep_leviathan:5,deep_seaserpent:1,deep_godfish:6,void_glitchfish:7,void_shadow:7,void_ghost:7,void_pixel:7,void_portal:7,void_serpent:7,void_dragon:7};
export const fishSprite=(id:string)=>itemSprites[id]??null;
const inhabitants:Record<string,number[]>={lake:[0,1,2,3],sea:[4,5,3,4],deep:[6,1,5,6],ruins:[2,4,0,3],void:[7,6,7,5]};
export function sceneSprites(location:string,cycle:number){const list=inhabitants[location]??inhabitants.lake;return [list[cycle%list.length],list[(cycle+1)%list.length],list[(cycle+2)%list.length]];}
