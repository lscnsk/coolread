# Веб-версия (PWA), отложена

Здесь лежит всё, что нужно только сайту, а не Android-приложению. В сборку APK эта папка не попадает.

- `public/` — service worker (`sw.js`), манифест PWA, иконки сайта, `_headers` и `_redirects` для хостинга.
- `github-workflows/deploy.yml` — публикация сайта на GitHub Pages.
- `snippets.md` — код, вынутый из `index.tsx`, `index.html` и `hooks/useLibrary.ts`.

## Как вернуть веб-версию

1. Скопировать `web-pwa/public/*` в `public/`.
2. Скопировать `web-pwa/github-workflows/deploy.yml` в `.github/workflows/`.
3. Вставить фрагменты из `snippets.md` на указанные места.
4. `npm run build`; готовый сайт будет в `dist/`.

Перед публикацией стоит проверить список файлов в `sw.js`: в нём перечислены файлы для офлайн-кэша, а часть из них за это время могла поменяться.
