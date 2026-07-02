@echo off
setlocal

node "%~dp0scripts\install-vsix-version.mjs" %*
exit /b %ERRORLEVEL%
