# Веб-версия CoolRead (PWA)

Та же читалка, что и в APK, но как сайт, который можно «установить»:
- Windows и Mac: Chrome или Edge → значок «Установить» в адресной строке;
- iPhone и iPad: Safari → «Поделиться» → «На экран Домой»;
- Mac в Safari: «Файл» → «Добавить в Dock».

После первого открытия приложение работает без интернета. Книги хранятся в браузере
на этом устройстве (с телефоном они не синхронизируются).

## Сборка

```
npm run build:web     # готовый сайт в dist-web/
```

Сборка APK (`npm run android:cool` и т. п.) эту папку не использует.

Что здесь лежит:
- `public/` — манифест, значки; при веб-сборке копируется в `dist-web/`;
- `sw.template.js` — service worker; сборка вписывает в него список всех файлов для офлайн-работы;
- `cors-proxy/worker.js` — посредник для каталогов (см. ниже).

Публикацию на GitHub Pages делает `.github/workflows/deploy-web.yml` при каждом push в `main`.

## Чем веб-версия отличается от Android

- **Каталоги** (OPDS, az.lib.ru, MangaDex): браузер не даёт сайту читать чужие сайты,
  поэтому нужен посредник — Cloudflare Worker из `cors-proxy/worker.js`. Без него работает
  только каталог lscnsk (он на GitHub).
- **Озвучка**: используются голоса самого устройства (в Windows, macOS и iOS есть русские голоса).
  Встроенного голоса из APK здесь нет.
- **Встроенного браузера с кнопкой 📥 нет**: сайты открываются в новой вкладке.
- **Открыть с помощью**: на компьютере установленное приложение регистрируется для fb2, epub,
  pdf, cbz, cbr, mp3, m4b (Chrome/Edge).

## Посредник для каталогов (Cloudflare Worker, бесплатно)

1. Зарегистрироваться на https://dash.cloudflare.com → Workers & Pages → Create → Worker.
2. Назвать, например, `coolread-proxy`, нажать Deploy, затем Edit code, вставить весь
   `cors-proxy/worker.js`, Deploy.
3. Settings → Variables: добавить `ALLOWED_ORIGIN` = адрес сайта, например `https://name.github.io`.
4. В репозитории GitHub: Settings → Secrets and variables → Actions → вкладка Variables →
   New variable: `CORS_PROXY` = `https://coolread-proxy.<ваше-имя>.workers.dev/?url=`
5. Перезапустить публикацию: Actions → Deploy web version → Run workflow.
