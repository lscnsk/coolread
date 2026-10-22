# CoolRead

Читалка и аудиоплеер: fb2, epub, pdf, cbz/cbr, mp3/m4b/m4a.
React + Vite + Tailwind, Android-сборка через Capacitor (`com.coolread.app`).

Книги добавляются через системный выбор файлов и хранятся во внутренней памяти
приложения (IndexedDB), разрешения на доступ к файлам не нужны. В интернет
приложение выходит только по действию пользователя: обновление каталога или
скачивание книги из него.

## Сборка

```
npm install
npm run build          # веб-версия в dist/
npx cap sync android   # перенести сборку в android/
cd android && ./gradlew assembleCoolDebug   # APK в android/app/build/outputs/apk/cool/debug/
```

Из одного кода собираются два приложения:

- **CoolRead** (`com.coolread.app`), чистый, каталоги OPDS добавляет сам пользователь: `npm run android:cool`;
- **CoolRead с MangaDex** (тот же `com.coolread.app`), MangaDex в каталоге с первого запуска: `npm run android:cool-manga`;
- **BimboRead** (`com.coolread.bimbo`): розовый экран загрузки, своя иконка, тема Bimbo по умолчанию, в каталоге сразу flibusta и mangadex. Собирается командой `npm run android:bimbo`.

Предустановленные каталоги задаёт переменная `VITE_OPDS_PRESET` (`mangadex`, `flibusta,mangadex` или пусто). Они появляются только при первом запуске; дальше пользователь удаляет и добавляет каталоги сам.

BimboRead отличается переменной `VITE_FLAVOR=bimbo` при сборке веб-части и вариантом `bimbo` в `android/app/build.gradle`. Его ресурсы (иконка, экран загрузки, название) лежат в `android/app/src/bimbo/res/`. Приложения ставятся на телефон рядом и не мешают друг другу.

Для сборки APK нужны JDK 17+ и Android SDK (platform 34, build-tools 34).
