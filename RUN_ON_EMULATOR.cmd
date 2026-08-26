@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "ADB=%ANDROID_HOME%\platform-tools\adb.exe"
set "EMU=%ANDROID_HOME%\emulator\emulator.exe"
set "APK=dist-android\TriTrick-1.0.4.apk"
set "PKG=com.metamovidas.tritrick"

if not exist "%APK%" (
  echo No hay APK. Ejecuta BUILD_APK.cmd primero.
  pause
  exit /b 1
)

"%ADB%" devices | findstr /R "device$" >nul
if errorlevel 1 (
  echo Arrancando emulador Medium_Phone_API_36.1...
  start "" "%EMU%" -avd Medium_Phone_API_36.1
  echo Esperando al emulador...
  "%ADB%" wait-for-device
  :waitboot
  for /f "delims=" %%i in ('"%ADB%" shell getprop sys.boot_completed 2^>nul') do set BOOT=%%i
  if not "%BOOT%"=="1" (
    timeout /t 3 /nobreak >nul
    goto waitboot
  )
)

echo Instalando %APK%...
"%ADB%" install -r "%APK%"
echo Abriendo Tri-Trick...
"%ADB%" shell monkey -p %PKG% -c android.intent.category.LAUNCHER 1
echo.
echo App lista en el emulador. Puedes probarla como en un movil real.
pause
