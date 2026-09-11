# MCP Static Hosting

Свой хостинг сайтов, которыми управляет AI-агент через MCP: создание файлов,
предпросмотр, публикация версий и откат. Есть веб-панель, редактор, токены доступа
и парольная защита сайтов. Это новый независимый проект для чистой установки.

> Первичная публикация образов в Docker Hub ещё не завершена. Пока используйте
> [сборку из исходников](../README.md#build-from-source).

## Установка

Нужны Docker с Compose v2, Git и OpenSSL.

```sh
git clone https://github.com/reg2005/mcpStaticHosting.git
cd mcpStaticHosting
sh scripts/setup.sh
docker compose pull
docker compose up -d --wait
```

Откройте http://localhost:3000, зарегистрируйтесь и создайте токен в **MCP tokens**.
Панель покажет конфигурацию подключения агента. Попросите агента создать проект,
записать `index.html` и опубликовать сайт. Локальные адреса используют `lvh.me:3002`.

Скрипт создаёт `.env` с уникальными секретами и не перезаписывает существующий файл.
Данные находятся в именованных Docker volumes. `docker compose down` их сохраняет,
а `docker compose down -v` удаляет.

## Продакшен и свой домен

В репозитории есть отдельный [compose.prod.yaml](../compose.prod.yaml) с образами
`reg2005/mcp-static-hosting:0.1.0` и `reg2005/mcp-static-hosting-functions:0.1.0`
для `linux/amd64` (x86-64). Сборка на сервере не требуется.

```sh
sh scripts/setup.sh --production
# Заполните домены и EMAIL_FROM в .env.production
sh scripts/compose-prod.sh pull
sh scripts/compose-prod.sh up -d --wait
```

В `.env.production` задайте `AUTH_BASE_URL=https://panel.example.com`,
`MCP_PUBLIC_URL=https://mcp.example.com/mcp`, `PUBLIC_BASE_DOMAIN=sites.example.net`.
Замените примеры своими доменами. Настройте DNS, TLS и reverse proxy по
[инструкции](deployment.md). Для пользовательских сайтов используйте отдельный
регистрируемый домен от панели. Порты по умолчанию доступны только на localhost.

Регистрация в production закрыта. Для создания первого аккаунта временно задайте
`SIGNUPS_ENABLED=true` и выполните `sh scripts/compose-prod.sh up -d`.
Затем верните `false` и повторите команду. Без почтового провайдера подтверждение
почты отключено и сброс пароля не доставляется.

Сборка и публикация выполняются локально; GitHub Actions не используются.

## Ограничения

Ранний выпуск для одного сервера и доверенных авторов. Серверные Deno-функции
экспериментальные и выключены по умолчанию. Нет автоматической DNS-проверки владения
доменом и автоматической выдачи wildcard TLS. Не заявляется готовность к публичному
многопользовательскому сервису с недоверенными авторами.

- [Настройки](configuration.md)
- [MCP и токены](mcp.md)
- [Резервные копии, обновления и откат](operations.md)
- [Безопасность](../SECURITY.md)
- [Разработка](../CONTRIBUTING.md)
