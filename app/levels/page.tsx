import {redirect} from 'next/navigation';
import {legacyLevelsHref} from '../../lib/community/navigation';
export const dynamic='force-dynamic';
export default async function LevelsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=new URLSearchParams();for(const [key,value] of Object.entries(await searchParams))if(typeof value==='string')q.set(key,value);
 redirect(legacyLevelsHref(q));
}
