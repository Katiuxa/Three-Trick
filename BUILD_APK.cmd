@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
if not defined JAVA_HOME set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
call npm install
node scripts\build-android.cjs --aab
echo.
echo APK y AAB en dist-android\
pause
