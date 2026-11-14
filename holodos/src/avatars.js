export function createAvatars(db,app,tokenRequest){
 db.exec("CREATE TABLE IF NOT EXISTS avatar_cache(login TEXT PRIMARY KEY,avatar TEXT NOT NULL,updated_at INTEGER NOT NULL);");
 let access='',expires=0,pending;
 const safe=u=>typeof u==='string'&&/^https:\/\/static-cdn\.jtvnw\.net\//i.test(u)?u:'';
 async function get(logins){
  const names=[...new Set(logins.map(x=>String(x).toLowerCase()).filter(x=>/^[a-z0-9_]{1,25}$/.test(x)))].slice(0,50),out={},missing=[];
  for(const name of names){const cached=db.prepare('SELECT * FROM avatar_cache WHERE login=?').get(name);const session=db.prepare("SELECT avatar FROM web_sessions WHERE login=? AND avatar<>'' ORDER BY created_at DESC LIMIT 1").get(name);if(safe(session?.avatar)){out[name]=session.avatar;continue}if(cached&&Date.now()-cached.updated_at<86400000){out[name]=safe(cached.avatar);continue}const known=db.prepare('SELECT 1 FROM players WHERE login=?').get(name)||db.prepare('SELECT 1 FROM chat_stats WHERE login=?').get(name);if(known)missing.push(name);}
  if(missing.length&&app())try{
   if(!access||Date.now()>=expires){if(!pending)pending=tokenRequest({grant_type:'client_credentials'}).then(t=>{access=t.access_token;expires=Date.now()+(Number(t.expires_in)-60)*1000}).finally(()=>pending=null);await pending;}
   const params=new URLSearchParams();for(const name of missing)params.append('login',name);
   const response=await fetch('https://api.twitch.tv/helix/users?'+params,{headers:{Authorization:'Bearer '+access,'Client-Id':app().id},signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Avatar lookup failed');const data=await response.json();for(const u of data.data||[]){const url=safe(u.profile_image_url);if(url){const login=String(u.login).toLowerCase();db.prepare('INSERT INTO avatar_cache(login,avatar,updated_at) VALUES(?,?,?) ON CONFLICT(login) DO UPDATE SET avatar=excluded.avatar,updated_at=excluded.updated_at').run(login,url,Date.now());out[login]=url;}}
  }catch{}
  return out;
 }
 return {get};
}
