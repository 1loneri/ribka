export function createStreamStatus({app,tokenRequest,channel,fetcher=fetch,now=Date.now,ttl=10000}){
 let cached=null,pending=null,access='',expires=0;
 async function refresh(){
  try{const config=app();if(!config)throw Error('Twitch not configured');if(!access||now()>=expires){const t=await tokenRequest({grant_type:'client_credentials'});access=t.access_token;expires=now()+Math.max(0,Number(t.expires_in)-60)*1000;}
   const r=await fetcher('https://api.twitch.tv/helix/streams?user_login='+encodeURIComponent(channel),{headers:{Authorization:'Bearer '+access,'Client-Id':config.id},signal:AbortSignal.timeout(6000)});if(!r.ok){if(r.status===401){access='';expires=0;}throw Error('Stream status unavailable');}const data=await r.json();if(!Array.isArray(data.data))throw Error('Invalid stream status');cached={live:data.data.some(x=>x.type==='live'&&String(x.user_login).toLowerCase()===channel.toLowerCase()),known:true,checked_at:now()};
  }catch{cached={live:false,known:false,checked_at:now()};}return cached;
 }
 async function get(){if(cached&&now()-cached.checked_at<(cached.known?ttl:3000))return cached;if(!pending)pending=refresh().finally(()=>pending=null);return pending;}
 return {get};
}
