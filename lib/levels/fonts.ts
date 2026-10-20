export const OVERLAY_FONTS=[
 {id:'manrope',name:'Manrope',family:'"Wariouss Manrope",Arial,Helvetica,sans-serif',file:'/fonts/overlay/manrope.ttf',weight:'200 800'},
 {id:'rubik',name:'Rubik',family:'"Wariouss Rubik",Arial,Helvetica,sans-serif',file:'/fonts/overlay/rubik.ttf',weight:'300 900'},
 {id:'oswald',name:'Oswald',family:'"Wariouss Oswald",Arial,Helvetica,sans-serif',file:'/fonts/overlay/oswald.ttf',weight:'200 700'},
 {id:'jetbrains-mono',name:'JetBrains Mono',family:'"Wariouss JetBrains Mono",monospace',file:'/fonts/overlay/jetbrainsmono.ttf',weight:'100 800'},
 {id:'montserrat',name:'Montserrat',family:'"Wariouss Montserrat",Arial,Helvetica,sans-serif',file:'/fonts/overlay/montserrat.ttf',weight:'100 900'},
 {id:'comfortaa',name:'Comfortaa',family:'"Wariouss Comfortaa",Arial,Helvetica,sans-serif',file:'/fonts/overlay/comfortaa.ttf',weight:'300 700'},
 {id:'russo-one',name:'Russo One',family:'"Wariouss Russo One",Arial,Helvetica,sans-serif',file:'/fonts/overlay/russoone.ttf',weight:'400'},
 {id:'caveat',name:'Caveat',family:'"Wariouss Caveat",cursive',file:'/fonts/overlay/caveat.ttf',weight:'400 700'},
 {id:'lora',name:'Lora',family:'"Wariouss Lora",Georgia,serif',file:'/fonts/overlay/lora.ttf',weight:'400 700'},
 {id:'exo-2',name:'Exo 2',family:'"Wariouss Exo 2",Arial,Helvetica,sans-serif',file:'/fonts/overlay/exo2.ttf',weight:'100 900'},
] as const;
export type OverlayFontId=typeof OVERLAY_FONTS[number]['id'];
export const overlayFontFor=(id:unknown)=>OVERLAY_FONTS.find(font=>font.id===id)??OVERLAY_FONTS[0];
export const overlayFontFaces=OVERLAY_FONTS.map(font=>`@font-face{font-family:${font.family.split(',')[0]};src:url("${font.file}") format("truetype");font-style:normal;font-weight:${font.weight};font-display:swap}`).join('\n');
