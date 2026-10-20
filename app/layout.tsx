import type { Metadata } from "next";
import CursorRingField from "./components/cursor-ring-field";
import {FishingAccessProvider} from './components/fishing-access-context';
import {getChatGPTUser} from './chatgpt-auth';
import {hasFishingAccess} from '../lib/fishing/access';
import {fishingIdentity} from '../lib/fishing/identity';
import {env} from 'cloudflare:workers';
import {SiteViewerProvider,type SiteViewer} from './components/site-viewer-context';
import "./globals.css";
import "./redesign.css";
import "./editorial.css";
import "./zine-theme.css";
import "./site-fonts.css";

export const metadata: Metadata = {
  title: "wariouss — Розыгрыши",
  description: "Розыгрыши для игрового сообщества",
  icons: {
    icon: "/wariouss-icon.svg",
    shortcut: "/wariouss-icon.svg",
  },
};

export const dynamic='force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let canFish=false,viewer:SiteViewer|null=null;
  let user:Awaited<ReturnType<typeof getChatGPTUser>>=null;
  try{user=await getChatGPTUser();}catch{console.error('Не удалось проверить вход на сайт.');}
  try{canFish=await hasFishingAccess(user);}catch{console.error('Не удалось проверить доступ к рыбалке.');}
  try{
    const identity=await fishingIdentity(user);
    if(identity){
      viewer={login:identity.username,avatar:null};
      try{
        const cached=await env.DB!.prepare('SELECT avatar FROM demo_profiles WHERE twitch_id=?').bind(identity.twitchId).first<{avatar:string}>();
        if(cached?.avatar){const url=new URL(cached.avatar);if(url.protocol==='https:'&&url.hostname==='static-cdn.jtvnw.net'&&!url.port)viewer.avatar=url.toString();}
      }catch{}
    }
  }catch{console.error('Не удалось загрузить профиль Twitch для навигации.');}
  return (
    <html lang="ru">
      <body className="antialiased dropzone-v2"><CursorRingField/><div className="site-content-backdrop" aria-hidden="true"/><FishingAccessProvider allowed={canFish}><SiteViewerProvider viewer={viewer}>{children}</SiteViewerProvider></FishingAccessProvider></body>
    </html>
  );
}
