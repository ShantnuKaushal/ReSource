Write-Host "--- Waking up the Brain (Docker) ---" -ForegroundColor Cyan
# Start Database and Backend in the background
docker compose up -d --build

Write-Host "--- Launching the Eyes (Mobile App) ---" -ForegroundColor Green
# Open a new terminal window for the Mobile App
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd mobile; npx expo start --tunnel"

Write-Host "--- ReSource is now running! ---" -ForegroundColor Yellow
Write-Host "Check the new terminal window for the QR code."