import type {RoomLayout} from '../../lib/community/model';
const palettes={
 ember:{wall:'#b6b0a5',shadow:'#99948c',accent:'#743c3a',poster:'#582b31',light:'#e9d6b3'},
 forest:{wall:'#a6aca0',shadow:'#888f83',accent:'#45594b',poster:'#2f423b',light:'#dfd9b8'},
 night:{wall:'#a4a9b4',shadow:'#858b9b',accent:'#434d69',poster:'#2c3047',light:'#c9d2e5'},
};
function Can({x,y,tone='#92b958',white=false}:{x:number;y:number;tone?:string;white?:boolean}){
 return <g transform={`translate(${x} ${y})`}><rect x="2" width="14" height="2" fill="#a9aa9e"/><rect y="2" width="18" height="28" fill={white?'#d5d4c5':'#1d2222'}/><rect x="2" y="3" width="2" height="26" fill={white?'#eeede1':'#3d4140'}/><rect x="16" y="3" width="2" height="27" fill="#101717" opacity=".4"/><path d="M5 7h2l1 3v10H6v-9L4 9Zm4 0 2 3v10H9V11L7 8Zm4 0 2 2v12h-2V11l-2-3Z" fill={tone}/><rect x="4" y="24" width="11" height="1" fill={white?'#414547':'#afb4a0'}/><rect x="5" y="26" width="9" height="1" fill={tone}/><rect x="2" y="30" width="14" height="2" fill="#9c9f98"/></g>;
}
function Books({x,y,n=7}:{x:number;y:number;n?:number}){return <g>{Array.from({length:n},(_,i)=><g key={i}><rect x={x+i*11} y={y+(i*7)%9} width={i%3===0?9:7} height={28-(i*7)%9} fill={['#4c5357','#856450','#c4b99e','#77605e','#515c5b','#aaa69a','#49434b'][i%7]}/><rect x={x+2+i*11} y={y+13} width="3" height="2" fill="#dad4bd" opacity=".6"/></g>)}</g>;}
function Star({x,y,size=1,color='#bcbeb5'}:{x:number;y:number;size?:number;color?:string}){return <path transform={`translate(${x} ${y}) scale(${size})`} d="M0-12 3-3 12 0 3 3 0 12-3 3-12 0-3-3Z" fill={color}/>;}
export default function RoomScene({layout}:{layout:RoomLayout}){
 const c=palettes[layout.palette];
 return <svg viewBox="0 0 800 480" role="img" aria-label="Пиксельная комната стримера: белый стеллаж, рабочее место, гранжевые постеры и Monster на полке" shapeRendering="crispEdges" className="community-room-scene">
  <defs><clipPath id="room-floor-clip"><path d="M38 335H761L796 462H5Z"/></clipPath></defs>
  <rect width="800" height="480" fill="#171a1c"/>
  <path d="M24 22H776V348H24Z" fill="#363a3b"/><path d="M38 36H761V335H38Z" fill={c.wall}/><path d="M38 36H761V46H38ZM38 46H49V335H38Z" fill="#dbd7ca"/><path d="M761 46H749V335H761Z" fill={c.shadow}/>
  <g clipPath="url(#room-floor-clip)"><path d="M38 335H761L796 462H5Z" fill="#5e4b41"/>
  {[0,1,2,3,4,5].map(i=><g key={i}><path d={`M${32-i*5} ${344+i*21}H${768+i*5}`} stroke="#302b2a" strokeWidth="3"/>{Array.from({length:8},(_,j)=><path key={j} d={`M${30+j*105+(i%2)*45} ${345+i*21}h${36+j%3*9}`} stroke={j%2?'#93775d':'#4b3d35'} strokeWidth="2"/>)}{[94,262,430,598,746].map((x,j)=><path key={x} d={`M${x+i%2*40} ${344+i*21}l${j%2?3:-3} 20`} stroke="#352c29" strokeWidth="2"/>)}</g>)}
  </g>
  <path d="M38 326H761V338H38Z" fill="#d0c8b7"/><path d="M38 333H761V340H38Z" fill="#3b3734"/>
  {/* The reference room's pale panelled doors and tall floor lamp. */}
  <rect x="53" y="48" width="155" height="274" fill="#686a63"/><rect x="59" y="49" width="143" height="268" fill="#d4d1c5"/>
  {[64,134].map(x=><g key={x}><rect x={x} y="58" width="63" height="250" fill="#e3dfd2"/><path d={`M${x+7} 69h49v95h-49Zm0 108h49v119h-49Z`} fill="#c3c0b6"/><path d={`M${x+10} 72h44v88h-44Zm0 108h44v112h-44Z`} fill="#d5d1c5"/><path d={`M${x+12} 75h39v82h-39Zm0 109h39v105h-39Z`} fill="#dedace"/></g>)}
  <rect x="127" y="48" width="4" height="265" fill="#999b92"/><rect x="119" y="174" width="4" height="9" fill="#6f716b"/><rect x="136" y="174" width="4" height="9" fill="#6f716b"/>
  <path d="M231 90H251V98H246V308H239V98H231Z" fill="#434747"/><path d="M222 306H261V312H222Z" fill="#363b3b"/><path d="M219 91V82h6V72h32v10h7v9Z" fill="#dcdad0"/><path d="M227 72V66h27v6Z" fill="#f6edda"/>
  <path d="M221 83h42v12h-42Z" fill="#ece3cf"/><rect x="214" y="93" width="57" height="6" fill="#e5d8bb"/>
  <path d="M211 103h61v50h-61Zm-10 50h81v44h-81Z" fill="#e8dbb6" opacity=".12"/>
  {/* Photocopied posters, tape, chrome stars and a little Y2K orbit. */}
  <g><path d="M297 66h107v5h6v129h-6v5H295v-8h-4V73h6Z" fill="#d2ccba"/><path d="M300 75h100v115h-100Z" fill={c.poster}/><rect x="307" y="83" width="87" height="9" fill="#d0c7b2"/><text x="309" y="91" fill="#25272b" fontFamily="monospace" fontWeight="bold" fontSize="9">AFTER HOURS</text><path d="M311 171l22-66 13 45 15-37 18 58Z" fill="#a7a698"/><path d="M322 160l12-36 7 34 19-22 9 29Z" fill="#333235"/><rect x="307" y="179" width="87" height="4" fill="#bab3a3"/><rect x="290" y="64" width="23" height="10" fill="#b4a98b"/><rect x="389" y="194" width="25" height="9" fill="#b4a98b"/></g>
  <g><path d="M420 103h99v102h-99Z" fill="#27292d"/><rect x="425" y="108" width="89" height="92" fill="#c8c4b7"/><path d="M433 173h73v16h-73Z" fill="#2e3034"/><text x="436" y="184" fill="#d6d2c6" fontFamily="monospace" fontWeight="bold" fontSize="10">NO SIGNAL</text><path d="M442 145h54m-40-23v42m23-47v42" stroke="#6d6c6c" strokeWidth="3"/><path d="M436 145h67m-61-4v8m54-8v8m-45-17v26m28-30v34" stroke="#31333a" strokeWidth="2"/><rect x="432" y="99" width="20" height="10" fill="#c6bba2"/><rect x="499" y="196" width="18" height="9" fill="#b9ad91"/></g>
  <g fill="none" stroke="#d8d5c7" strokeWidth="3"><path d="M443 73h39l12 9-12 10h-39l-12-10Z"/><path d="M454 62h16l8 13v15l-8 13h-16l-8-13V75Z"/></g><Star x={513} y={69} size={.6} color="#ece6d5"/>
  {Array.from({length:70},(_,i)=><rect key={i} x={303+(i*29)%89} y={100+(i*17)%72} width={i%3?2:4} height="2" fill={i%2?'#d2ccba':'#23262a'} opacity=".28"/>)}
  {/* Dark seating, familiar blue cushions and a red throw. */}
  <path d="M68 244h218v66H68Z" fill="#1e2528"/><path d="M77 252h201v52H77Z" fill="#30383b"/><path d="M64 291h226v32H64Z" fill="#171e22"/><path d="M71 298h96v19H71Zm102 0h108v19H173Z" fill="#343d40"/><rect x="57" y="272" width="22" height="49" fill="#222c30"/><rect x="279" y="276" width="20" height="46" fill="#1a2328"/><rect x="72" y="323" width="9" height="18" fill="#1c1e20"/><rect x="276" y="323" width="8" height="18" fill="#1c1e20"/>
  <path d="M88 250h32v5h5v35H84v-31h4Z" fill="#799cac"/><path d="M92 253h25v7H92Z" fill="#98b5bf"/><path d="M239 255h35v36h-35Z" fill={c.accent}/><path d="M240 255h6v38h-6m14-38h4v37h-4" fill="#d4bfb0" opacity=".35"/>
  {/* White built-in shelves, as in the reference. Monster stays on its own shelf. */}
  <path d="M549 45h190v296H549Z" fill="#777d79"/><path d="M556 45h177v288H556Z" fill="#c4c6bc"/><path d="M565 54h159v185H565Z" fill="#7d8681"/>
  <rect x="570" y="59" width="149" height="43" fill="#6d7571"/><Books x={576} y={69} n={10}/><rect x="693" y="70" width="19" height="28" fill="#353f42"/><rect x="696" y="74" width="13" height="2" fill="#d2cdbc"/>
  <rect x="561" y="101" width="166" height="8" fill="#e1dfd2"/><path d="M565 110h159v4H565Z" fill="#5e6664"/>
  <Can x={577} y={117}/><Can x={600} y={117} tone="#6f99ae"/><Can x={623} y={117} white tone="#5d6569"/><Can x={646} y={117} tone="#bb6556"/><Can x={669} y={117} tone="#c7b67f"/><Can x={692} y={117} tone="#8fae70"/>
  <rect x="561" y="150" width="166" height="8" fill="#dddcd0"/><rect x="568" y="158" width="153" height="4" fill="#66706e"/>
  <rect x="575" y="174" width="83" height="28" fill="#1e282c"/><rect x="581" y="179" width="71" height="5" fill="#3b484c"/><rect x="590" y="190" width="41" height="2" fill="#657773"/><rect x="641" y="192" width="5" height="3" fill="#92a57f"/><rect x="587" y="166" width="58" height="8" fill="#313b3c"/>
  <path d="M674 178h25v-9h9v28h-7v5h-31v-7h-5v-11h9Z" fill="#303b3d"/><path d="M675 186h11m-5-5v11" stroke="#989d8f" strokeWidth="3"/><rect x="696" y="185" width="4" height="4" fill="#8d6358"/>
  <rect x="561" y="205" width="166" height="8" fill="#e0ddcf"/><Books x={575} y={215} n={5}/><path d="M647 225h62v17h-62Z" fill="#3a4445"/><rect x="652" y="229" width="51" height="3" fill="#7a8179"/>
  <path d="M556 245h177v88H556Z" fill="#cdcec3"/>{[250,273].map(y=><g key={y}><rect x="564" y={y} width="161" height="18" fill="#e0ddd0"/><path d={`M566 ${y+17}h157`} stroke="#a7aca3" strokeWidth="2"/><rect x="635" y={y+7} width="17" height="3" fill="#a5a99f"/></g>)}
  <rect x="564" y="298" width="77" height="32" fill="#d9d8cc"/><rect x="647" y="298" width="78" height="32" fill="#dedcd0"/><rect x="632" y="309" width="3" height="9" fill="#9b9f94"/><rect x="652" y="309" width="3" height="9" fill="#9b9f94"/>
  <path d="M554 45h10v290h-10Zm171 0h9v290h-9Z" fill="#e5e1d4"/><rect x="552" y="335" width="184" height="6" fill="#999f95"/>
  {/* A chair draped in soft blue, rather than an anonymous empty living room. */}
  <path d="M463 238h52v6h10v91h-73v-83h11Z" fill="#242e32"/><path d="M463 243h53v8h7v57h-62v-55h2Z" fill="#7fabc0"/><path d="M471 242h36v6h10v8h-51v-8h5Z" fill="#9fbfc9"/><path d="M462 268h7v36h-7Zm8 37h45v7h-45Z" fill="#6691a6"/><path d="M451 317h78v15h-78Z" fill="#b3a068"/><rect x="460" y="333" width="9" height="39" fill="#594b37"/><rect x="515" y="333" width="8" height="39" fill="#594b37"/>
  {/* Empty desk chair. */}
  <path d="M339 247h50v64h-50Z" fill="#192126"/><path d="M345 243h38v8h8v62h-51v-63h5Z" fill="#263238"/>
  {/* Desk, screen, pixel keyboard and modest hardware. */}
  <path d="M241 309h177l24 25H220Z" fill="#898376"/><path d="M222 333h222v10H222Z" fill="#4c4a44"/><rect x="237" y="343" width="8" height="45" fill="#292c2d"/><rect x="423" y="343" width="8" height="45" fill="#292c2d"/>
  <path d="M239 257h80v50h-80Z" fill="#20282b"/><rect x="244" y="262" width="70" height="39" fill="#354449"/><path d="M249 292v-13h12v8h9v-15h17v8h13v-8h9v24h-60Z" fill="#798f84"/><path d="M252 268h25v3h-25Zm42 0h12v3h-12Z" fill="#b3b9a1"/><rect x="271" y="307" width="13" height="9" fill="#353d3d"/><rect x="261" y="315" width="33" height="4" fill="#424844"/>
  <path d="M287 322h61l8 7h-77Z" fill="#252e33"/>{Array.from({length:11},(_,i)=><rect key={i} x={287+i*5} y={323+i%2*2} width="3" height="2" fill={i%3?'#9eaaa0':'#b16a5a'}/>)}<rect x="367" y="320" width="12" height="7" fill="#c4b9a3"/>
  <rect x="395" y="347" width="24" height="41" fill="#1e292e"/><rect x="398" y="351" width="18" height="5" fill="#586262"/><rect x="399" y="361" width="15" height="14" fill="#333f43"/><rect x="404" y="365" width="5" height="6" fill={c.accent}/>
  {/* The shared choice changes the room, not just its label. */}
  {layout.corner==='books'?null:layout.corner==='arcade'?<g><path d="M71 207h68l10 17-5 65 12 18v71H64v-72l11-16Z" fill="#222b2f"/><rect x="78" y="216" width="56" height="15" fill={c.accent}/><text x="83" y="227" fontFamily="monospace" fontSize="9" fill="#dfd4bd">PLAY_</text><rect x="82" y="241" width="48" height="43" fill="#697e7f"/><path d="M90 274h8v-9h8v9h8v-16h8v20H90Z" fill="#c8c3a2"/><rect x="73" y="302" width="73" height="11" fill={c.accent}/><rect x="91" y="294" width="4" height="12" fill="#bbb29e"/><rect x="121" y="304" width="6" height="3" fill="#b9c8b1"/><rect x="87" y="338" width="40" height="6" fill="#65716b"/></g>:<g><rect x="93" y="337" width="45" height="37" fill="#8e7861"/><rect x="99" y="345" width="32" height="25" fill="#a69375"/><path d="M116 339V251m0 34-26-19m26 35 25-25m-25 41-25-15" stroke="#52665b" strokeWidth="5"/><path d="M105 256h22v17h-22Zm-27 0h20v18H78Zm53 10h23v17h-23Zm-52 30h21v19H79Z" fill="#6e8870"/></g>}
  <path d="M196 395h365l43 52H158Z" fill="#302c2e"/><path d="M205 401h348l30 39H178Z" fill={layout.rug==='waves'?'#59666c':layout.rug==='sun'?'#8b7969':'#a49a85'}/>
  {layout.rug==='check'?<g fill="#3c4244">{Array.from({length:24},(_,i)=><path key={i} d={`M${201+i%12*30} ${405+Math.floor(i/12)*17}h16l7 11h-16Z`} opacity={i%2===0?'1':'.45'}/>)}</g>:layout.rug==='sun'?<g><Star x={379} y={421} size={1.6} color="#d5c6a4"/><path d="M247 413h53m153 15h57" stroke="#393e40" strokeWidth="5"/><Star x={482} y={411} size={.6} color="#473e3d"/></g>:<g stroke="#a4b5b4" strokeWidth="4" fill="none"><path d="M198 414h55l13 9h50l13-9h50l13 9h50l13-9h50l13 9h40"/><path d="M187 433h50l13-9h50l13 9h50l13-9h50l13 9h50l13-9h55"/></g>}
  <g className="community-pixel-cat"><path d="M625 391v-21h7v-8l9 8h17l8-8v29h-41Z" fill="#b9b6a4"/><rect x="635" y="380" width="3" height="3" fill="#293436"/><rect x="654" y="380" width="3" height="3" fill="#293436"/><rect x="644" y="385" width="5" height="2" fill="#8d6e61"/><path d="M625 385h-16v-10h-6v16h22Z" fill="#918f83"/></g>
  <path d="M511 356h27v15h-27Z" fill="#9c886c"/><rect x="515" y="359" width="19" height="4" fill="#c3b59c"/><Can x={528} y={386} tone="#99b860"/>
  {/* Scattered scuffs and print grain keep the scene tactile. */}
  {Array.from({length:95},(_,i)=><rect key={i} x={51+(i*43)%686} y={52+(i*31)%275} width={i%4===0?3:1} height={i%3===0?3:1} fill={i%2?'#d8d5c8':'#3e4443'} opacity=".16"/>)}
  <path d="M24 341v107H8v14h784v-14h-16V341h-10v113H34V341Z" fill="#171b1d"/><rect x="26" y="462" width="748" height="5" fill="#090f13"/>
  <g className="community-room-specks" fill="#e1dbc5" opacity=".35"><rect x="214" y="206" width="2" height="2"/><rect x="411" y="221" width="2" height="2"/><rect x="263" y="133" width="2" height="2"/></g>
 </svg>;
}
