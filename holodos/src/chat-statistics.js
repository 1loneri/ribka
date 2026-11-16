// Only conversational messages contribute to chat statistics.
export function shouldCountChatMessage(message){
 if(typeof message!=='string')return false;
 const text=message.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/gu,'').replace(/\s/gu,'');
 if(!text||/^[!/]/u.test(text))return false;
 // Bracket faces such as ))), :( and ;) contain no conversational text.
 return !/^[()[\]{}<>:;=+\-_^~|\\/]+$/u.test(text);
}
