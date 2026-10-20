import {chatText} from './messages';

const address=/(^|[^\p{L}\p{N}_])(?:ботик|бот|bot)(?=$|[^\p{L}\p{N}_])/iu;
const ignoredBots=new Set(['nightbot','streamelements','streamlabs','moobot','fossabot','wizebot','sery_bot']);
export function botQuestion(text:string,login:string,userId:string,sender:{login:string;id:string}):string|null{
 if(!userId||!login||userId===sender.id||login.toLowerCase()===sender.login.toLowerCase()||ignoredBots.has(login.toLowerCase()))return null;
 if(Array.from(text).length>500)return null;
 const clean=chatText(text);if(!clean||/^[!/]/.test(clean))return null;
 let question:string;
 const match=address.exec(clean);
 if(match)question=clean.slice(0,match.index)+match[1]+clean.slice(match.index+match[0].length);
 else if(clean.toLowerCase().includes('@'+sender.login.toLowerCase())&&/^[a-z0-9_]{1,25}$/i.test(sender.login)){
  const escaped=sender.login.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const mention=new RegExp('@'+escaped+'(?=$|[^a-z0-9_])','i');if(!mention.test(clean))return null;question=clean.replace(mention,'');
 }else return null;
 return question.replace(/^[\s,.:!?-]+|[\s,.:!-]+$/g,'').replace(/^(?:скажи|ответь|подскажи)[\s,:-]*/iu,'').trim()||'привет';
}

const fortunes=[
 'шуточный прогноз: завтра затащишь катку, но опять забудешь, зачем заходил на кухню',
 'мой несерьёзный прогноз: завтра найдёшь что-то вкусное в холодильнике. надеюсь, это будет не вчерашний чай',
 'шуточно гадаю: завтра ляжешь пораньше. ну, хотя бы скажешь это вслух',
 'шуточный прогноз на завтра: одна нормальная катка и пять минут поисков телефона, который у тебя в руке',
 'мой несерьёзный прогноз: завтра всё будет спокойно, пока кто-нибудь не скажет «давай ещё одну»',
 'шуточный прогноз: завтра вспомнишь попить воды без напоминания. вот это уже сильно',
 'шуточно предсказываю: завтра найдёшь вторую носку. первая к тому времени куда-нибудь денется',
 'мой несерьёзный прогноз: завтра будет повод посмеяться с какой-нибудь ерунды. такие обычно самые смешные',
];
const greetings=['да норм, братик. у тебя как?','да спокойно всё, с вами тут болтаю','нормально, на связи. что у вас тут?','да всё чилл, пока без приключений'];
const gaming=['держи прицел чуть выше и не стреляй на бегу. хотя на словах это, конечно, попроще','после пары сливов лучше выдохнуть. ещё одна катка на злости редко помогает','сыграй рядом с тиммейтом. хотя бы будет кому сказать, что ты почти попал','не спеши сразу всех перестрелять. иногда просто подождать реально работает'];
const jokes=['мышку пока не бей, она ещё кредит за себя не отработала','главное сказать «последняя катка» достаточно уверенно. вдруг в этот раз сработает','аим в отпуске, зато желание нажать «ещё одну» работает без выходных','план был нормальный. просто противники почему-то не согласились'];
const support=['эх, выдохни немного. можешь рассказать, я тут','бывает такой день, когда вообще ничего не идёт. можно чуть сбавить темп','не обязательно сейчас всё вытягивать. побудь немного без этой суеты'];
const lightChoices=new Set(['чай','кофе','пицца','бургер','кино','музыка','катка','дуо','соло','стрим','спать','сейдж','джетт','рейна','рэйз']);
function pick(lines:string[],previous:string[]){const choices=lines.filter(line=>!previous.includes(line));const pool=choices.length?choices:lines;return pool[crypto.getRandomValues(new Uint32Array(1))[0]%pool.length];}
export function basicBotAnswer(question:string,previous:string[]=[]):string{
 const q=question.toLowerCase().replace(/ё/g,'е');
 if(/не хочу жить|самоубий|суицид|покончить с собой|навредить себе/.test(q))return 'мне жаль, что тебе сейчас так тяжело. побудь рядом с человеком, которому доверяешь, и обратись за срочной местной помощью, если можешь навредить себе';
 if(/боле[ею]|лекарств|таблет|диагноз|инвест|кредит|процент.*доход|ставк.*деньг/.test(q))return 'с таким лучше без случайных прогнозов, братик. я тут для болтовни, а не для решений про здоровье и деньги';
 if(/завтра|будущ|предскаж|прогноз|судьб|гороскоп|что .*ждет/.test(q))return pick(fortunes,previous);
 if(/шутк|анекдот|прикол|рассмеши/.test(q))return pick(jokes,previous);
 if(/кто ты|как тебя зовут|ты человек/.test(q))return 'я Лёха, бот этого чата. болтаю тут с вами';
 if(/груст|тильт|устал|поддерж|мотивац|плохое настроение/.test(q))return pick(support,previous);
 const choice=q.replace(/^(?:ну\s+)?(?:что\s+)?(?:мне\s+)?(?:лучше\s+)?(?:выбрать\s+|выбери\s+|посоветуешь\s+)?/,'').replace(/[?!.,]+$/g,'').split(/\sили\s/);
 if(choice.length===2&&choice.every(value=>lightChoices.has(value)))return 'мой выбор по вайбу — '+choice[crypto.getRandomValues(new Uint32Array(1))[0]%2]+'. решение за тобой, я тут только подкидываю монетку';
 if(/аим|прицел|стреля|тащить|играть|агент|ранг|клатч|valorant|валора/.test(q))return pick(gaming,previous);
 if(/спасибо|благодар/.test(q))return 'да без проблем, братик';
 if(/привет|прив|здаров|даров|как дел|как ты|как жизнь|ку\??$|хай|салют|добрый/.test(q))return pick(greetings,previous);
 if(/спокойной ночи|пора спать|доброй ночи/.test(q))return 'спокойной, братик. катки никуда не денутся';
 if(/как день|чем занят|что делаешь/.test(q))return 'сижу в чате, ловлю вайб и делаю вид, что «последняя катка» действительно последняя';
 if(/красив|любишь|нравлюсь|оцени.*вайб/.test(q))return 'по вайбу сообщения — свой человек в чате. держи дружеский респект';
 return 'я пока в лайт-режиме: могу поболтать, поддержать или выдать шуточный прогноз на завтра';
}

export function cleanBotAnswer(value:string):string|null{
 const plain=value.replace(/[#*0-9]\uFE0F?\u20E3|[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200D\uFE0E\uFE0F\u{E0020}-\u{E007F}]/gu,'')
  .replace(/[:;=][-^']?[()]+|(?<!\p{L})[:;=][-^']?[DPp]+(?!\p{L})|\b[xX][dD]+\b/gu,'');
 const answer=chatText(plain).replace(/[\u2012-\u2015]/g,'-').replace(/[`*_~]/g,'').replace(/@[a-z0-9_]+/gi,'').trim();
 if(!answer||/^[/.!]/.test(answer)||/https?:\/\/|www\.|sk-[a-z0-9_-]{12,}/i.test(answer))return null;
 if(/(?:^|[^\p{L}])(?:ху[йеяию]|пизд|еба[нлт]|бляд|блят|нахуй|f[\W_]*u[\W_]*c[\W_]*k)/iu.test(answer))return null;
 const letters=Array.from(answer);return letters.length>300?letters.slice(0,299).join('')+'…':answer;
}
