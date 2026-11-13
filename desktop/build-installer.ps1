$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$tools = Join-Path $projectRoot 'output/build-deps/installer'
$compilerRoot = Join-Path $tools 'inno-7.1.1'
$compiler = Join-Path $compilerRoot '{app}/ISCC.exe'
New-Item -ItemType Directory -Force -Path $tools | Out-Null

function Get-VerifiedArchive($Url, $Destination, $Sha256) {
    if (-not (Test-Path -LiteralPath $Destination)) {
        & curl.exe --fail --location --connect-timeout 10 --max-time 180 --silent --show-error $Url --output $Destination
        if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
    }
    if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $Sha256) {
        throw "Archive checksum mismatch: $Destination"
    }
}

if (-not (Test-Path -LiteralPath $compiler)) {
    $extractorArchive = Join-Path $tools 'innounp-2.71.3.zip'
    Get-VerifiedArchive 'https://raw.githubusercontent.com/jrathlev/InnoUnpacker-Windows-GUI/75ded58da3a81c029db4f73ab803b9b4154400e9/innounp-2/bin/innounp-2.zip' $extractorArchive 'f8e45c9676bebc7d7570108ab572673b541fcf7a7d3d24a04319ac6b5315b4e8'
    $extractorRoot = Join-Path $tools 'innounp-2.71.3'
    Expand-Archive -LiteralPath $extractorArchive -DestinationPath $extractorRoot -Force
    $compilerArchive = Join-Path $tools 'innosetup-7.1.1-x64.exe'
    Get-VerifiedArchive 'https://github.com/jrsoftware/issrc/releases/download/is-7_1_1/innosetup-7.1.1-x64.exe' $compilerArchive '8a5a6711c3766a6e5fb74f280ba0e3551e719ce94538d901fdbd1f8f9920b3f0'
    # Read the compiler archive without running its installer or changing system tools.
    & (Join-Path $extractorRoot 'innounp.exe') -x -b ('-d' + $compilerRoot) $compilerArchive
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $compiler)) { throw 'Compiler archive extraction failed.' }
}

$bootstrapper = Join-Path $tools 'MicrosoftEdgeWebview2Setup.exe'
if (-not (Test-Path -LiteralPath $bootstrapper)) {
    & curl.exe --fail --location --connect-timeout 10 --max-time 120 --silent --show-error 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' --output $bootstrapper
    if ($LASTEXITCODE -ne 0) { throw 'WebView2 bootstrapper download failed.' }
}
$signature = Get-AuthenticodeSignature -LiteralPath $bootstrapper
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
    throw 'WebView2 bootstrapper signature verification failed.'
}

& (Join-Path $PSScriptRoot 'build.ps1') -SkipZip
if (-not $?) { throw 'Desktop build failed.' }
$appVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$setupOutput = Join-Path $projectRoot 'output/installer'
$compilerArgs = @('/Qp', ('/DAppVersion=' + $appVersion), ('/DPayloadDir=' + (Join-Path $projectRoot 'output/desktop/WhereFile')),
    ('/DAppIcon=' + (Join-Path $projectRoot 'output/build-deps/wherefile.ico')), ('/DSetupOutputDir=' + $setupOutput),
    ('/DWebViewBootstrapper=' + $bootstrapper), (Join-Path $PSScriptRoot 'installer.iss'))
& $compiler @compilerArgs
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
$setupPath = Join-Path $setupOutput "WhereFile-v$appVersion-Setup-x64.exe"
$checksum = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $setupOutput 'SHA256SUMS.txt'), "$checksum  $([IO.Path]::GetFileName($setupPath))`n", (New-Object Text.UTF8Encoding($false)))
Write-Output "Installer: $setupPath"
