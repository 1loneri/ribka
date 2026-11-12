# Лёха — независимый Холодос

Отдельный Twitch-бот команд для `bot_leha_ai` в чате `war1ouss`, с SQLite-базой на Railway Volume.

Команды: `!холодос`, `!баланс`, `!топмонет`, `!статмонет`, `!магазин`. 90 секунд между открытиями; вероятности 65/27/7/1 процентов. Не отвечает на разговоры, не изменяет существующий сайт. Дуэли и выдача VP отключены до проверки правил и оформления призов.

Railway: корневая папка `/holodos`, старт `npm start`, Node 22. Установите `BOT_USERNAME=bot_leha_ai`, `TWITCH_CHANNEL=war1ouss`, `DB_PATH=/data/leha.sqlite`, `PUBLIC_URL=https://<your-domain>`, `ADMIN_PASSWORD` (16+), `APP_SECRET` (32+). Создайте Railway Volume `/data`. В Twitch Developer Console зарегистрируйте Confidential app с redirect `https://<your-domain>/oauth/callback`. Client ID и Secret введите в защищённой панели. Авторизуйте bot_leha_ai.

Возможна коллизия со старым ботом на командах `!баланс` и `!магазин`; проверить перед запуском.
