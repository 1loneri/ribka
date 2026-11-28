export const botCommands=[
 {command:'!холодос',description:'Открыть Холодос и посмотреть результат.',example:'!холодос',access:'Раз в 2 минуты. Во время стрима — всем; вне эфира — администраторам.'},
 {command:'!баланс',description:'Узнать свой баланс W-монет или баланс другого игрока.',example:'!баланс или !баланс @игрок',access:'Все пользователи.'},
 {command:'!топмонет',description:'Показать 5 игроков с самым большим балансом W.',example:'!топмонет',access:'Все пользователи.'},
 {command:'!статмонет',description:'Посмотреть свои открытия, выигрыши, джекпоты и баланс.',example:'!статмонет',access:'Все пользователи.'},
 {command:'!магазин',description:'Посмотреть ассортимент и цены магазина VP.',example:'!магазин',access:'Все пользователи.'},
 {command:'!купить',description:'Создать заявку на ручную выдачу VP за W-монеты.',example:'!купить 240',access:'Доступны 240, 475 и 1000 VP. Можно дописать VP после числа.'},
 {command:'!заказ',description:'Посмотреть статус своего последнего заказа.',example:'!заказ',access:'Все пользователи.'},
 {command:'!заказы',description:'Альтернативная запись команды !заказ.',example:'!заказы',access:'Все пользователи; показывает последний заказ.'},
 {command:'!дуэль',description:'Вызвать игрока на дуэль с указанной ставкой W.',example:'!дуэль @player 100',access:'Нужны ник и целое число W. Дуэли должны быть включены.',duel:true},
 {command:'!принять',description:'Принять адресованный тебе вызов на дуэль.',example:'!принять',access:'Только получатель активного вызова; ответить нужно за 60 секунд.',duel:true},
 {command:'!отказ',description:'Отклонить адресованный тебе вызов на дуэль.',example:'!отказ',access:'Только получатель активного вызова.',duel:true}
];
export function renderBotCommands(escape,duelsEnabled){
 return '<section class="admin-panel" id="bot-commands"><h2>Команды бота</h2><p class="admin-note">Все действующие команды Twitch-бота. Команды не засчитываются в статистику сообщений. Отдельных админских чат-команд сейчас нет: управление находится в этой панели.</p><div class="admin-command-table"><table><thead><tr><th>Команда</th><th>Что делает</th><th>Пример</th><th>Условия</th></tr></thead><tbody>'+botCommands.map(c=>'<tr><td><code>'+escape(c.command)+'</code></td><td>'+escape(c.description)+'</td><td><code>'+escape(c.example)+'</code></td><td>'+escape(c.duel&&!duelsEnabled?'Сейчас дуэли выключены. '+c.access:c.access)+'</td></tr>').join('')+'</tbody></table></div></section>';
}
