@echo off
echo Установка Cordova...
npm install -g cordova

echo Создание Cordova проекта...
cordova create cosmic-cat-app com.cosmiccat.chat "Космический Кот"

echo Копирование файлов...
xcopy /E /Y public\* cosmic-cat-app\www\
copy config.xml cosmic-cat-app\

cd cosmic-cat-app

echo Добавление платформы Android...
cordova platform add android

echo Установка плагинов...
cordova plugin add cordova-plugin-whitelist
cordova plugin add cordova-plugin-camera
cordova plugin add cordova-plugin-media-capture
cordova plugin add cordova-plugin-file
cordova plugin add cordova-plugin-device
cordova plugin add cordova-plugin-network-information

echo Сборка APK...
cordova build android

echo APK готов в: platforms\android\app\build\outputs\apk\debug\app-debug.apk
pause