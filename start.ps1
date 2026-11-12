$ErrorActionPreference = 'Stop'
$islandRoot = $PSScriptRoot
$islandUrl = 'http://127.0.0.1:4173'
$islandReady = $false
try {
    $response = Invoke-WebRequest -Uri $islandUrl -UseBasicParsing -TimeoutSec 2
    if ($response.Content -notmatch 'tidal|ocean.js|app.js') { throw 'Port 4173 is occupied by another application.' }
    $islandReady = $true
} catch {
    if ($_.Exception.Message -like '*occupied*') { throw }
}
if (-not $islandReady) {
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    Start-Process -FilePath $nodePath -ArgumentList ('"' + (Join-Path $islandRoot 'server.mjs') + '"') -WorkingDirectory $islandRoot -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $response = Invoke-WebRequest -Uri $islandUrl -UseBasicParsing -TimeoutSec 1
            if ($response.StatusCode -eq 200) { $islandReady = $true; break }
        } catch {}
    }
}
if (-not $islandReady) { throw 'Could not start the island. Run npm start in this folder to inspect the error.' }
Start-Process $islandUrl
