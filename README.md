# STREAMIX

Платформа прямых эфиров с React и Vite, Express, Supabase и Mux. OBS отправляет видео и звук напрямую в Mux по RTMPS. Зрители получают поток HLS. Express проверяет подписи вебхуков Mux и обновляет статус эфира в PostgreSQL. Supabase Realtime передаёт обновления статуса и чата открытым страницам.

## Что понадобится

- Windows 10/11 и [Node.js](https://nodejs.org/) 22.12 или новее. Удобнее установить актуальную LTS-версию.
- [Supabase](https://supabase.com/dashboard), новый проект с включённым Data API.
- [Mux](https://dashboard.mux.com), окружение с доступом к Live Streaming. Проверьте [условия тарифа Mux](https://www.mux.com/pricing) перед первым эфиром.
- [OBS Studio](https://obsproject.com/download).
- Для проверки вебхука на компьютере без домена — публичный HTTPS-туннель, например [ngrok](https://ngrok.com/download). В продакшене подойдёт HTTPS-адрес, выданный хостингом.

## 1. Настройте Supabase

1. Откройте Dashboard → **New project**. Создайте новый проект и дождитесь запуска базы.
2. Откройте **SQL Editor → New query**, вставьте содержимое `supabase/schema.sql` и нажмите **Run**. Запустите этот файл один раз в новом проекте. Он создаёт таблицы, индексы, RLS, профили при регистрации и добавляет таблицы чата и эфиров в публикацию `supabase_realtime`.
3. Нажмите **Connect** или откройте настройки проекта. Скопируйте **Project URL** вида `https://xxxxx.supabase.co` и публичный **Publishable key** (`sb_publishable_…`). Допустим legacy-ключ `anon`.
4. В **Settings → API Keys** найдите серверный **Secret key** (`sb_secret_…`) или legacy **service_role**. Он понадобится только в `server/.env`.
5. В **Authentication → URL Configuration** поставьте **Site URL** `http://localhost:5173` и добавьте **Redirect URL** `http://localhost:5173/settings`. При запуске локальной production-сборки добавьте также `http://localhost:8787/settings`.
6. Проверьте, что вход по email включён. При включённом подтверждении письма откройте ссылку на том же компьютере, где запущен STREAMIX. Если тестируете с обычными внешними почтовыми адресами и письма не доходят, настройте [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp). На время локальной проверки можно выключить **Confirm email** и зарегистрировать новые тестовые аккаунты. Перед публикацией включите подтверждение и настройте доставку писем.

## 2. Настройте Mux

1. В [Mux Dashboard](https://dashboard.mux.com) выберите окружение. В **Settings → Access Tokens** создайте токен с правами **Mux Video Read** и **Write**. Сохраните Token ID и Token Secret.
2. Для теста без домена установите ngrok, выполните авторизацию по инструкции ngrok и откройте отдельное окно PowerShell.

   ```powershell
   ngrok http 8787
   ```

3. Скопируйте HTTPS-адрес из строки **Forwarding**. В Mux откройте настройки вебхуков того же окружения и создайте endpoint, например `https://ваш-адрес.ngrok-free.app/api/webhooks/mux`. Если Mux просит выбрать события, включите `video.live_stream.active`, `video.live_stream.idle`, `video.live_stream.disabled` и `video.live_stream.deleted`.
4. Скопируйте **Signing Secret** для этого endpoint. Если Mux предлагает тестовую доставку, выполните её после запуска API. При смене адреса туннеля обновите URL вебхука и проверьте, изменился ли его секрет.

## 3. Запустите STREAMIX на Windows

Распакуйте архив. В PowerShell перейдите в папку `STREAMIX` с файлом `package.json` и выполните:

```powershell
node --version
npm.cmd --version
Copy-Item .\web\.env.example .\web\.env
Copy-Item .\server\.env.example .\server\.env
notepad .\web\.env
notepad .\server\.env
```

Заполните переменные в двух открытых файлах.

| Файл | Переменная | Значение |
| --- | --- | --- |
| `web/.env` | `VITE_SUPABASE_URL` | Project URL |
| `web/.env` | `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key или `anon` |
| `server/.env` | `SUPABASE_URL` | Тот же Project URL |
| `server/.env` | `SUPABASE_SERVICE_KEY` | Secret key или `service_role` |
| `server/.env` | `MUX_TOKEN_ID` | Mux Token ID |
| `server/.env` | `MUX_TOKEN_SECRET` | Mux Token Secret |
| `server/.env` | `MUX_WEBHOOK_SECRET` | Signing Secret вебхука |

Оставьте локальные значения `PORT` и `APP_ORIGINS` из примера. Vite пересылает запросы `/api` на порт 8787. Backend-переменные загружаются из `server/.env` или окружения процесса. После правок перезапускайте приложение.

```powershell
npm.cmd ci
npm.cmd run dev
```

Откройте [http://localhost:5173](http://localhost:5173). [http://localhost:8787/api/health](http://localhost:8787/api/health) проверяет запуск Express. При первом входе в **Мой профиль** выберите имя пользователя, добавьте описание и при желании HTTPS-ссылку на изображение аватара.

## 4. Запустите первый эфир в OBS

1. В STREAMIX войдите в аккаунт и откройте **Студия**. Укажите название, выберите категорию и нажмите **Создать трансляцию**. Один аккаунт получает один переиспользуемый канал. Название и категорию можно менять перед каждым эфиром.
2. Скопируйте поля **Сервер RTMPS** и **Ключ трансляции**. Mux использует общий адрес `rtmps://global-live.mux.com:443/app` и персональный ключ для каждого канала.
3. В OBS откройте **Настройки → Трансляция**, выберите сервис **Пользовательский / Custom…** и вставьте адрес сервера и ключ в отдельные поля.
4. Добавьте источник видео, например **Захват игры** или **Устройство захвата видео**, и проверьте микрофон в микшере OBS. Для первого теста используйте H.264, AAC, 720p, 30 FPS, CBR около 3000 кбит/с и интервал ключевых кадров 2 секунды.
5. Нажмите **Начать трансляцию**. Когда Mux подготовит HLS и доставит `video.live_stream.active`, канал появится на главной с бейджем LIVE. Задержка зависит от обработки и доставки вебхука.
6. Откройте канал в другом браузере. Включите звук кнопкой в плеере, проверьте видео и звук. Войдите со вторым аккаунтом и отправьте сообщение. Оно должно появиться в обеих вкладках. Владелец канала может удалить сообщение кнопкой с корзиной. Также проверьте подписку на канал через раздел **Подписки**.
7. Нажмите **Остановить трансляцию** в OBS. Mux оставляет короткое окно для переподключения (в проекте 30 секунд). После события `video.live_stream.idle` канал исчезнет из списка LIVE.

## 5. Опубликуйте проект

В production Express раздаёт и React, и API по одному адресу. Выберите Node.js-хостинг с HTTPS и Node.js 22.12+. Домен хостинга подходит для первого запуска.

1. Загрузите исходники на хостинг. Установите зависимости командой `npm ci --include=dev`, выполните сборку `npm run build`, укажите команду старта `npm start`.
2. Перед сборкой установите две публичные переменные `VITE_…`. Для runtime задайте серверные переменные из таблицы, `NODE_ENV=production` и `APP_ORIGINS=https://ваш-адрес`. Используйте `PORT` хостинга. `TRUST_PROXY_HOPS` оставьте равным 0, если Express работает напрямую. При доверенном reverse proxy укажите фактическое число переходов согласно настройкам хостинга, чтобы общий API-лимит учитывал IP клиентов.
3. В Supabase задайте публичный **Site URL** и добавьте `https://ваш-адрес/settings` в Redirect URLs. В Mux настройте `https://ваш-адрес/api/webhooks/mux` и задайте секрет этого endpoint.
4. Повторите проверку двух аккаунтов, LIVE, звука, чата и остановки OBS. Для локальной проверки production-сборки выполните `npm.cmd run build`, затем `npm.cmd start` и откройте `http://localhost:8787`.

## Диагностика

| Симптом | Что проверить |
| --- | --- |
| Студия выдаёт ошибку при создании эфира | Выполнен ли SQL, верен ли серверный ключ Supabase, есть ли права Video Read/Write и доступ к Live в выбранном окружении Mux. |
| OBS подключился, но нет LIVE | Найдите ресурс в Mux и проверьте статус. В истории доставки webhook проверьте URL, доступность Express и ответ: 204 означает принятую доставку, 401 указывает на секрет или подпись. После исправления повторите эфир. |
| Нет звука | Проверьте кнопку звука в плеере, индикаторы микшера OBS и настройки выходной аудиодорожки. |
| Чат не обновляется сразу | Проверьте публикацию `supabase_realtime` и доступ к WebSocket Supabase. Интерфейс также перечитывает последние 60 сообщений каждые 30 секунд. |
| Не открывается страница после подтверждения email | Проверьте Redirect URLs в Supabase и точный адрес, по которому открыт STREAMIX. |

Потоки HLS и чат публичны. Ключ OBS доступен владельцу и серверу. В чате действует ограничение одно сообщение в две секунды на аккаунт, запрет обычных ссылок и лимит 300 символов. Модерация доступна владельцу канала. Supabase хранит историю чата, а Mux может создавать активы записей без публичного playback ID для VOD. Публичный каталог показывает до 60 последних активных каналов. Количество одновременных зрителей и архив записей в интерфейсе не предусмотрены.

## Справка

- [Mux Live Streaming](https://www.mux.com/docs/guides/start-live-streaming)
- [События Mux](https://www.mux.com/docs/core/listen-for-webhooks)
- [Подпись вебхуков Mux](https://www.mux.com/docs/core/verify-webhook-signatures)
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Supabase Auth Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
