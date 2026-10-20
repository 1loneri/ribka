import HomepageApp from './homepage/homepage-app';
import {getChatGPTUser} from './chatgpt-auth';
import {getRole} from '../lib/streamer-auth';
export const dynamic='force-dynamic';
export const metadata={title:'wariouss · Главная',description:'Розыгрыши, моменты из Valorant, уровни и сообщество Twitch.'};
export default async function Page(){
 const user=await getChatGPTUser();let admin=false,canStream=false;
 try{const role=await getRole(user);admin=role.admin;canStream=!!role.streamer;}catch{console.error('Не удалось загрузить роль для главной страницы.');}
 return <HomepageApp user={user?{name:user.displayName}:null} admin={admin} canStream={canStream}/>;
}
