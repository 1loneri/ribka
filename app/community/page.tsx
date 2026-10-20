import type {Metadata} from 'next';
import CommunityApp from './community-app';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Сообщество · wariouss',description:'Профили и уровни зрителей, общая комната чата и игра «Тайный зритель».'};
export default function Page(){return <CommunityApp/>;}
