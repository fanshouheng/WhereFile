$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$islandRoot = Split-Path $PSScriptRoot -Parent
$keyDirectory = Join-Path $islandRoot '.local'
$keyPath = Join-Path $keyDirectory 'ppdog-key.xml'
$form = New-Object System.Windows.Forms.Form
$form.Text = 'WhereFile · 生图配置'
$form.ClientSize = New-Object System.Drawing.Size(510, 250)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10)

$label = New-Object System.Windows.Forms.Label
$label.Text = "PP.dog API Key`r`nhttps://pp.dog/v1 · gpt-image-2.5"
$label.Location = New-Object System.Drawing.Point(24, 22)
$label.Size = New-Object System.Drawing.Size(460, 48)
$form.Controls.Add($label)

$inputBox = New-Object System.Windows.Forms.TextBox
$inputBox.UseSystemPasswordChar = $true
$inputBox.Location = New-Object System.Drawing.Point(24, 82)
$inputBox.Size = New-Object System.Drawing.Size(460, 28)
$form.Controls.Add($inputBox)

$note = New-Object System.Windows.Forms.Label
$note.Text = "密钥仅在本机加密保存，用于连接 PP.dog。`r`n保存不会发起生图或扣费。"
$note.Location = New-Object System.Drawing.Point(24, 122)
$note.Size = New-Object System.Drawing.Size(460, 50)
$form.Controls.Add($note)

$save = New-Object System.Windows.Forms.Button
$save.Text = '保存配置'
$save.Location = New-Object System.Drawing.Point(354, 190)
$save.Size = New-Object System.Drawing.Size(130, 36)
$save.Add_Click({
    $keyText = $inputBox.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($keyText) -or $keyText -match '\s') {
        $note.Text = '请粘贴完整的 API Key，不要包含空格或换行。'
        return
    }
    try {
        New-Item -ItemType Directory -Force -Path $keyDirectory | Out-Null
        $secureKey = ConvertTo-SecureString -String $keyText -AsPlainText -Force
        $secureKey | Export-Clixml -LiteralPath $keyPath
        $secureKey.Dispose()
        $inputBox.Clear()
        $note.Text = '已保存。可以关闭窗口，回到 Codex 继续。'
        $save.Enabled = $false
    } catch {
        $note.Text = '保存失败，请检查项目目录是否可写。'
    } finally {
        $keyText = $null
    }
})
$form.Controls.Add($save)
$form.AcceptButton = $save
$form.Add_Shown({ $inputBox.Focus() })
[void]$form.ShowDialog()
$inputBox.Clear()
$form.Dispose()
