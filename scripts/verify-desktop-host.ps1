$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$dep=Join-Path $projectRoot 'output/build-deps/webview2-1.0.4314.35/lib/net462'
$testDir=Join-Path $projectRoot 'output/desktop-tests'
New-Item -ItemType Directory -Force $testDir | Out-Null
Copy-Item "$dep/Microsoft.Web.WebView2.*.dll" $testDir -Force
Copy-Item -LiteralPath "$projectRoot/output/desktop/WhereFile/www" -Destination $testDir -Recurse -Force
Copy-Item -LiteralPath "$projectRoot/output/desktop/WhereFile/WebView2Loader.dll" -Destination $testDir -Force
$argsList=@('/nologo','/target:exe','/platform:x64','/main:DesktopHostTest',("/out:$testDir/VerifyDesktopHost.exe"),'/r:System.dll','/r:System.Core.dll','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:Microsoft.CSharp.dll',"/r:$dep/Microsoft.Web.WebView2.Core.dll","/r:$dep/Microsoft.Web.WebView2.WinForms.dll")
$argsList+=@('desktop/WallpaperHost.cs','desktop/DesktopShell.cs','desktop/DesktopBoats.cs','desktop/DesktopIconMask.cs','desktop/AlphaWindow.cs','scripts/VerifyDesktopHost.cs') | ForEach-Object{Join-Path $projectRoot $_}
& "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe" @argsList
if($LASTEXITCODE -ne 0){throw 'Test compilation failed.'}
& "$testDir/VerifyDesktopHost.exe"
if($LASTEXITCODE -ne 0){throw 'Native pipeline test failed.'}
