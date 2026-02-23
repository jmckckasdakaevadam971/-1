# LED Drone Replacement Sim

## Локальный запуск

1. `npm install`
2. `npm run dev` — фронтенд (http://localhost:5173)
3. `npm run backend` — backend (http://localhost:4000)

## Деплой по одной ссылке (Render)

Проект подготовлен для деплоя как один сервис: backend + собранный фронтенд.

### Вариант A: через Blueprint (рекомендуется)

1. Залей проект в GitHub репозиторий.
2. На Render выбери `New +` → `Blueprint`.
3. Подключи репозиторий и подтверди создание сервиса из `render.yaml`.
4. Дождись статуса `Live` и открой выданный URL.

### Вариант B: вручную Web Service

1. `New +` → `Web Service`.
2. Подключи GitHub репозиторий.
3. Build Command: `npm install && npm run build`
4. Start Command: `npm run start`
5. Environment: `Node`
6. После деплоя открой URL сервиса.

## Важно

- Сервер использует порт из переменной окружения `PORT` (для Render это обязательно).
- В проде API и WebSocket работают от того же домена/ссылки, дополнительная настройка не нужна.
- Для локальной разработки API/WS по-прежнему направляются на `localhost:4000` при запуске Vite на `5173`.
