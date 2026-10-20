import atlas from './cat-room-props.json';
export function RoomProp({item,className=''}:{item:number;className?:string}){
 const [x,y,width,height]=atlas.frames[item];return <span className={'cat-room-prop '+className} aria-hidden="true"><svg viewBox={`0 0 ${width} ${height}`} className="cat-room-art"><image href="/cat-room-props-v1.png" width={atlas.width} height={atlas.height} x={-x} y={-y}/></svg></span>;
}
export default function CatRoomDecor({full=false}:{full?:boolean}){return <div className="cat-room-decor" aria-hidden="true"><RoomProp item={0} className="cat-room-chair"/><RoomProp item={1} className="cat-room-bed"/><RoomProp item={2} className="cat-room-table"/><RoomProp item={3} className="cat-room-toys"/><RoomProp item={full?4:5} className="cat-room-bowl"/></div>;}
