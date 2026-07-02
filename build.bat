@echo off
setlocal

node "%~dp0scripts\build-vsix-version.mjs" %*
exit /b %ERRORLEVEL%

