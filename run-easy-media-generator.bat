@echo off
setlocal
title Easy Media Generator
set "EXIT_CODE=0"

pushd "%~dp0"
if errorlevel 1 goto :folder_error
set "PUSHED_DIRECTORY=1"

if not exist "package.json" goto :project_error

where npm.cmd >nul 2>&1
if errorlevel 1 goto :npm_error

if /i "%~1"=="--check" (
  echo Easy Media Generator launcher prerequisites are available.
  goto :done
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm ci
  if errorlevel 1 goto :command_error
)

echo Building Easy Media Generator...
call npm run build
if errorlevel 1 goto :command_error

echo.
echo Starting Easy Media Generator...
echo Local URL: http://127.0.0.1:3000
echo Press Ctrl+C to stop the application.
echo.
call npm start
if errorlevel 1 goto :command_error
goto :done

:folder_error
echo Unable to open the launcher directory.
set "EXIT_CODE=1"
goto :pause_and_done

:project_error
echo package.json was not found in "%CD%".
set "EXIT_CODE=1"
goto :pause_and_done

:npm_error
echo npm was not found. Install Node.js 20 or newer and try again.
set "EXIT_CODE=1"
goto :pause_and_done

:command_error
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
echo.
echo The application could not be started. Review the error above.

:pause_and_done
pause

:done
if defined PUSHED_DIRECTORY popd
endlocal & exit /b %EXIT_CODE%