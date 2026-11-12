param([switch]$SkipZip)
$ErrorActionPreference = 'Stop'
$islandRoot = Split-Path $PSScriptRoot -Parent
$version = '1.0.4314.35'
$deps = Join-Path $islandRoot "output/build-deps/webview2-$version"
$archive = Join-Path $islandRoot "output/build-deps/webview2-$version.nupkg"
$release = Join-Path $islandRoot 'output/desktop/海屿壁纸'
New-Item -ItemType Directory -Force -Path (Split-Path $archive), $release | Out-Null
if (-not (Test-Path -LiteralPath "$deps/lib/net462/Microsoft.Web.WebView2.Core.dll")) {
    & curl.exe --fail --location --connect-timeout 10 --max-time 120 --silent --show-error "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" --output $archive
    if ($LASTEXITCODE -ne 0) { throw 'WebView2 package download failed.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $deps)
}
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework compiler was not found.' }

# Create an application icon from the project's own generated boat asset.
Add-Type -AssemblyName System.Drawing
$iconPath = Join-Path $islandRoot 'output/build-deps/haiyu.ico'
$bitmap = New-Object System.Drawing.Bitmap(64,64)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([Drawing.Color]::FromArgb(27,174,190))
$boat = [Drawing.Image]::FromFile((Join-Path $islandRoot 'assets/boat-hd.png'))
$graphics.DrawImage($boat, 0, 0, 64, 64)
$icon = [Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [IO.File]::Create($iconPath)
try { $icon.Save($stream) } finally { $stream.Dispose(); $icon.Dispose(); $boat.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }

$executable = Join-Path $release '海屿壁纸.exe'
$references = @('System.dll','System.Core.dll','System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll','Microsoft.CSharp.dll',
    "$deps/lib/net462/Microsoft.Web.WebView2.Core.dll", "$deps/lib/net462/Microsoft.Web.WebView2.WinForms.dll")
$compileArgs = @('/nologo','/target:winexe','/platform:x64','/optimize+',('/out:' + $executable),('/win32icon:' + $iconPath),('/win32manifest:' + (Join-Path $PSScriptRoot 'app.manifest')))
foreach ($reference in $references) { $compileArgs += '/reference:' + $reference }
$compileArgs += Join-Path $PSScriptRoot 'WallpaperHost.cs'
$compileArgs += Join-Path $PSScriptRoot 'DesktopShell.cs'
$compileArgs += Join-Path $PSScriptRoot 'DesktopBoats.cs'
$compileArgs += Join-Path $PSScriptRoot 'DesktopIconMask.cs'
$compileArgs += Join-Path $PSScriptRoot 'AlphaWindow.cs'
& $compiler @compileArgs
if ($LASTEXITCODE -ne 0) { throw 'Native host compilation failed.' }
foreach ($name in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')) { Copy-Item -LiteralPath "$deps/lib/net462/$name" -Destination $release -Force }
Copy-Item -LiteralPath "$deps/runtimes/win-x64/native/WebView2Loader.dll" -Destination $release -Force
New-Item -ItemType Directory -Force -Path "$release/www/assets", "$release/licenses" | Out-Null
foreach ($name in @('index.html','app.js','ocean.js','voyage.js','style.css')) {
    Copy-Item -LiteralPath (Join-Path $islandRoot $name) -Destination "$release/www/$name" -Force
}
foreach ($name in @('boat-hd.png','coast-hd.webp','boat-directions.png','coast-snow.webp','coast-autumn.webp')) { Copy-Item -LiteralPath "$islandRoot/assets/$name" -Destination "$release/www/assets/$name" -Force }
Copy-Item -LiteralPath "$deps/LICENSE.txt" -Destination "$release/licenses/WebView2-LICENSE.txt" -Force
Copy-Item -LiteralPath "$deps/NOTICE.txt" -Destination "$release/licenses/WebView2-NOTICE.txt" -Force
Copy-Item -LiteralPath (Join-Path $islandRoot 'LICENSE') -Destination "$release/licenses/Haiyu-LICENSE.txt" -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '使用说明.txt') -Destination $release -Force
[IO.File]::WriteAllText((Join-Path $release '海屿壁纸.exe.config'), '<?xml version="1.0" encoding="utf-8"?><configuration><startup><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.6.2"/></startup></configuration>', (New-Object Text.UTF8Encoding($false)))

# Audit the exact bundle surface: credentials, historical reference art and tools stay outside.
$expected = @('海屿壁纸.exe','海屿壁纸.exe.config','使用说明.txt','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll',
    'www/index.html','www/app.js','www/ocean.js','www/voyage.js','www/style.css','www/assets/boat-hd.png','www/assets/coast-hd.webp','www/assets/boat-directions.png','www/assets/coast-snow.webp','www/assets/coast-autumn.webp',
    'licenses/WebView2-LICENSE.txt','licenses/WebView2-NOTICE.txt','licenses/Haiyu-LICENSE.txt')
$actual = @(Get-ChildItem -LiteralPath $release -File -Recurse | ForEach-Object { $_.FullName.Substring($release.Length + 1).Replace('\','/') })
$unexpected = @($actual | Where-Object { $_ -notin $expected })
if ($unexpected.Count) { throw ('Unexpected bundle files; inspect before distributing: ' + ($unexpected -join ', ')) }
if ($actual.Count -ne $expected.Count) { throw 'Incomplete bundle.' }
if (-not $SkipZip) {
    $zipPath = Join-Path (Split-Path $release) '海屿壁纸-Windows-x64.zip'
    Compress-Archive -LiteralPath $release -DestinationPath $zipPath -Force
    Write-Output "Portable ZIP: $zipPath"
}
Write-Output "Executable: $executable"
