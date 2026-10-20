import GiveawayApp from '../giveaway-app';
import {requireChatGPTUser} from '../chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Page(){await requireChatGPTUser('/studio');return <GiveawayApp studio/>;}
