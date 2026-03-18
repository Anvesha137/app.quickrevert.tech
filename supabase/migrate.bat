@echo off
echo Starting Supabase setup...

REM Check if supabase CLI is installed
where supabase >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Supabase CLI is not installed. Please install it first:
    echo npm install -g supabase
    exit /b 1
)

REM Start local Supabase development environment
echo Starting local Supabase environment...
supabase start

REM Apply the schema to the database
echo Applying schema to the database...
supabase db reset

echo Supabase setup complete!
echo Your local Supabase environment is now running.
echo.
echo API URL: http://127.0.0.1:54321
echo DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
echo.
echo To stop the local environment, run: supabase stop