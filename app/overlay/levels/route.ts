import {overlayDocument} from '../../../lib/levels/overlay';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const channel=new URL(req.url).searchParams.get('channel')??'';
 if(!/^[a-z0-9_]{1,25}$/.test(channel))return new Response('Не указан канал.',{status:400});
 return new Response(overlayDocument(channel),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src 'self'; img-src https://static-cdn.jtvnw.net; connect-src 'self'; frame-ancestors *; base-uri 'none'; form-action 'none'"}});
}
