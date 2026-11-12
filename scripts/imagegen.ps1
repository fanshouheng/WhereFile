param(
    [ValidateSet('Check', 'Generate')][string]$Action = 'Check',
    [ValidateSet('coast', 'boat', 'boat-directions', 'coast-snow', 'coast-autumn', 'scene-space', 'scene-desert', 'object-meteorite', 'object-tornado', 'scene-space-miniature', 'scene-desert-miniature', 'scene-space-lined', 'scene-desert-lined', 'scene-space-pixel', 'scene-desert-pixel', 'scene-space-surface')][string]$Asset = 'boat',
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$islandRoot = Split-Path $PSScriptRoot -Parent
$baseUrl = 'https://pp.dog/v1'
$model = 'gpt-image-2.5'
$cliPath = Join-Path $env:USERPROFILE '.codex/skills/.system/imagegen/scripts/image_gen.py'
$keyPath = Join-Path $islandRoot '.local/ppdog-key.xml'
$savedEnvironment = @{}
foreach ($name in @('OPENAI_API_KEY', 'OPENAI_BASE_URL', 'PYTHONIOENCODING', 'OPENAI_LOG')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$keyText = $null

try {
    if (-not $DryRun) {
        if (-not (Test-Path -LiteralPath $keyPath)) {
            throw '尚未配置密钥。请双击项目里的「配置生图.cmd」。'
        }
        $secureKey = Import-Clixml -LiteralPath $keyPath
        if ($secureKey -isnot [System.Security.SecureString]) { throw '密钥文件格式不正确，请重新配置。' }
        $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        try { $keyText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer) }
        finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
            $secureKey.Dispose()
        }
    }
    $env:OPENAI_API_KEY = $keyText
    $env:OPENAI_BASE_URL = $baseUrl
    $env:PYTHONIOENCODING = 'utf-8'
    $env:OPENAI_LOG = $null

    if ($Action -eq 'Check') {
        if ($DryRun) { throw 'DryRun 仅用于 Generate。' }
        try {
            $response = Invoke-RestMethod -Uri "$baseUrl/models" -Headers @{ Authorization = "Bearer $keyText" } -TimeoutSec 30 -MaximumRedirection 0
        } catch {
            $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'network' }
            throw "连接检查未通过（$statusCode）。请核对 PP.dog 密钥及网络。"
        }
        $models = @($response.data | ForEach-Object { $_.id })
        if ($models -notcontains $model) {
            throw '接口已响应，但模型列表没有 gpt-image-2.5；请检查密钥对应的模型分组。'
        }
        Write-Output '连接成功，账户模型列表包含 gpt-image-2.5。尚未调用生图接口。'
        return
    }

    if (-not (Test-Path -LiteralPath $cliPath)) { throw '未找到 Codex imagegen 技能脚本。' }
    $size = if ($Asset -like 'scene-*') { 'auto' } elseif ($Asset -in @('boat-directions', 'coast-snow', 'coast-autumn')) { '1536x1024' } elseif ($Asset -like 'coast*') { 'auto' } else { '1024x1024' }
    $promptPath = Join-Path $islandRoot "prompts/$Asset.txt"
    $outputPath = Join-Path $islandRoot "output/imagegen/$Asset.png"
    if (Test-Path -LiteralPath $outputPath) { throw "已有素材：$outputPath。请先另存或改名再生成。" }
    $cliArguments = @('-X', 'utf8', $cliPath, 'generate', '--model', $model,
        '--prompt-file', $promptPath, '--size', $size, '--quality', 'high',
        '--output-format', 'png', '--no-augment', '--out', $outputPath)
    if ($DryRun) { $cliArguments += '--dry-run' }
    Write-Output "服务：$baseUrl；模型：$model；素材：$Asset；尺寸：$size"
    # Invoke the bundled CLI; credentials stay in the child process environment.
    # Capture stderr as well so an upstream error cannot echo the saved key.
    $previousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $cliOutput = & python @cliArguments 2>&1; $cliExitCode = $LASTEXITCODE }
    finally { $ErrorActionPreference = $previousErrorPreference }
    foreach ($line in $cliOutput) {
        $text = [string]$line
        if ($keyText) { $text = $text.Replace($keyText, '[REDACTED]') }
        Write-Output $text
    }
    if ($cliExitCode -ne 0) { throw '生图未完成；请根据上面的错误检查接口或参数。' }
    if (-not (Test-Path -LiteralPath $outputPath) -or (Get-Item -LiteralPath $outputPath).Length -eq 0) {
        throw '接口未返回有效图片，输出文件为空。请重试生成。'
    }
} finally {
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
    $keyText = $null
}
