import type {Player} from '../../lib/fishing/game';
import {fishingLicenseStatus} from '../../lib/fishing/license';
import {Ticket} from 'lucide-react';

export default function LicenseCard({player,now}:{player:Player;now:number}){
 const status=fishingLicenseStatus(player,now),hours=Math.max(0,Math.ceil((status.until-now)/3600000));
 const text=status.phase==='new'?'Первые 48 часов ловли — бесплатно.':status.phase==='expired'?'Истекла. Продление при следующем забросе.':status.phase==='upgrade'?'Для этой локации доплата '+status.due+' монет.':(status.phase==='trial'?'Пробная · ':'Действует · ')+'ещё '+hours+' ч.';
 return <div className={'fish-license-card license-'+status.phase}><div><span><Ticket size={14}/>Лицензия</span><strong>{status.price} монет / 48 ч.</strong></div><p>{text}</p>{status.due>player.coins&&<small>Не хватает {status.due-player.coins} монет. Забери ежедневный бонус.</small>}</div>;
}
