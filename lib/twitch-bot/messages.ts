export const BOT_INTERVAL = 3000;
export function chatText(value: string) {
  const text = value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const letters = Array.from(text);
  return letters.length > 500 ? letters.slice(0, 499).join('') + '…' : text;
}
export function fishingReply(username: string, result: string, source: 'twitch' | 'site' = 'twitch') {
  return chatText('@' + username + (source === 'site' ? ' · заброс на сайте' : '') + ' · ' + result);
}
export function winnerReply(prize: string, names: string[]) {
  return chatText('Розыгрыш «' + prize + '» завершён. Победители: ' + names.join(', ') + '. Поздравляем!');
}
