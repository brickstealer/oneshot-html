# oneshot-html

Коллекция однофайловых HTML-экспериментов и frontend-only Node.js приложений (Next.js, Vite и др.) с автоматической сборкой и иерархическим каталогом на **GitHub Pages**.

- **Витрина на GitHub Pages**: `https://brickstealer.github.io/oneshot-html/`
- **Инструкция для AI-агентов по адаптации новых проектов**: [AGENTS.md](./AGENTS.md)

## Как устроен репозиторий

Любая папка/HTML-файл в репозитории (кроме служебных `scripts/`, `.github/`, `.gemini/`, `_site/`, `node_modules/` и скрытых `.*`) автоматически попадает на главную страницу с сохранением структуры папок:

- `*.html` в обычных папках → публикуются как автономные HTML-проекты (`oneshot-html/trains/argon-1.html`).
- Папка с `index.html` (без `package.json`) → публикуется целиком как статический мини-сайт.
- Папка с `package.json` → автоматически определяется фреймворк (`Next.js`, `Vite`, `Astro`, `CRA`, `Node.js`) и пакетный менеджер (`bun`, `pnpm`, `yarn`, `npm`), выполняется установка зависимостей и статическая сборка с нужным `PAGES_BASE_PATH`.

## Локальные команды

```bash
# Посмотреть обнаруженные проекты и их типы
npm run discover

# Проверить проекты на совместимость с GitHub Pages
npm run check

# Собрать весь сайт с префиксом /oneshot-html (как на GitHub Pages)
npm run build:pages

# Запустить локальный preview-сервер на http://127.0.0.1:4173/oneshot-html/
npm run preview:pages

# Запустить тесты оркестратора сборки
npm test
```

## Однократная настройка на GitHub

Чтобы workflow [pages.yml](./.github/workflows/pages.yml) публиковал сайт:
1. Откройте на GitHub: **Settings → Pages**.
2. В разделе **Build and deployment → Source** выберите **GitHub Actions**.
3. После push в ветку `main` (или ручного запуска **Run workflow**) сайт соберётся и задеплоится автоматически.

## Опциональная настройка проектов и категорий

- В папку проекта можно положить `gh-pages.json` для переопределения `title`, `description`, `tags`, `order`, `buildCommand`, `outputDir` или `"ignore": true`.
- В папку-категорию можно положить `_category.json` (`title`, `description`, `order`, `ignore`).
- Подробный чеклист адаптации под Next.js / Vite / AI Studio описан в [AGENTS.md](./AGENTS.md).
