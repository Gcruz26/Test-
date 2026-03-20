@echo off
setlocal

cd /d "C:\Projetos\Books\Books_bank"

set /p PROCESS_LIMIT=How many transactions do you want to process? (0 = all): 
set /p APPLY_MATCHES=Apply real matches in Zoho? (yes/no): 

if "%PROCESS_LIMIT%"=="" set "PROCESS_LIMIT=0"
if /I "%APPLY_MATCHES%"=="yes" (
    set "APPLY_BANK_MATCHES=true"
) else (
    set "APPLY_BANK_MATCHES=false"
)

echo Running Zoho Banking Reconciliation...
echo.
set "LOG_FILE=C:\Projetos\Books\Books_bank\zoho_banking_reconciliation_output.txt"
set "BANK_PROCESS_LIMIT=%PROCESS_LIMIT%"
"C:\Users\gilda\AppData\Local\Programs\Python\Python312\python.exe" "C:\Projetos\Books\Books_bank\zoho_banking_reconciliation.py" 2>&1 | powershell -Command "Tee-Object -FilePath '%LOG_FILE%'"

echo.
echo Output saved to:
echo %LOG_FILE%
echo.
echo Done.
pause
