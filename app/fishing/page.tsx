import FishingApp from './fishing-app';
import {redirect} from 'next/navigation';
import {getChatGPTUser} from '../chatgpt-auth';
import {hasFishingAccess} from '../../lib/fishing/access';
export const dynamic='force-dynamic';
export const metadata={title:'Рыбка · wariouss',description:'Twitch-рыбалка: уловы, локации, удочки и задания.'};
export default async function FishingPage(){
 if(!await hasFishingAccess(await getChatGPTUser()))redirect('/');
 return <FishingApp/>;
}
