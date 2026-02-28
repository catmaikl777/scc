# Сборка APK из HTML приложения

## Требования:
1. Node.js (версия 14+)
2. Android Studio с SDK
3. Java JDK 8+

## Быстрая сборка:

### Вариант 1: Автоматический скрипт
```bash
# Запустите build-apk.bat
build-apk.bat
```

### Вариант 2: Ручная сборка
```bash
# 1. Установите Cordova
npm install -g cordova

# 2. Создайте проект
cordova create cosmic-cat-app com.cosmiccat.chat "Космический Кот"

# 3. Скопируйте файлы
cp -r public/* cosmic-cat-app/www/
cp config.xml cosmic-cat-app/

# 4. Перейдите в папку проекта
cd cosmic-cat-app

# 5. Добавьте платформу Android
cordova platform add android

# 6. Соберите APK
cordova build android
```

## Готовый APK:
Файл будет в: `cosmic-cat-app/platforms/android/app/build/outputs/apk/debug/app-debug.apk`

## Для продакшена:
```bash
cordova build android --release
```

## Альтернатива - Capacitor:
```bash
npm install -g @capacitor/cli
npx cap init
npx cap add android
npx cap copy
npx cap open android
```