#ifndef AppVersion
  #error AppVersion is required
#endif

[Setup]
AppId={{C68DD33B-E89E-4988-8E24-FDABF851245C}
AppName=WhereFile
AppVersion={#AppVersion}
AppPublisher=WhereFile
AppPublisherURL=https://github.com/fanshouheng/WhereFile
DefaultDirName={localappdata}\Programs\WhereFile
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.14393
DisableProgramGroupPage=yes
DisableDirPage=no
UninstallDisplayIcon={app}\WhereFile.exe
SetupIconFile={#AppIcon}
WizardStyle=modern
OutputDir={#SetupOutputDir}
OutputBaseFilename=WhereFile-v{#AppVersion}-Setup-x64
VersionInfoVersion={#AppVersion}.0
Compression=lzma2/ultra64
SolidCompression=yes
CloseApplications=no
RestartApplications=no

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#WebViewBootstrapper}"; DestName: "MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy

[Icons]
Name: "{autoprograms}\WhereFile"; Filename: "{app}\WhereFile.exe"; Parameters: "--manage"; WorkingDir: "{app}"

[Run]
Filename: "{app}\WhereFile.exe"; Parameters: "--manage"; Description: "打开 WhereFile"; Flags: nowait postinstall skipifsilent

[Code]
const
  InstanceMutex = 'Local\HaiyuWallpaper.Instance';
  RuntimeKey = 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function OpenEvent(DesiredAccess: LongWord; InheritHandle: Boolean; Name: String): THandle;
  external 'OpenEventW@kernel32.dll stdcall';
function SetEvent(EventHandle: THandle): Boolean;
  external 'SetEvent@kernel32.dll stdcall';
function CloseHandle(Handle: THandle): Boolean;
  external 'CloseHandle@kernel32.dll stdcall';

function CloseWhereFile: Boolean;
var
  EventHandle: THandle;
  Attempt: Integer;
begin
  Result := not CheckForMutexes(InstanceMutex);
  if Result then Exit;
  EventHandle := OpenEvent(2, False, 'Local\HaiyuWallpaper.exit');
  if EventHandle <> 0 then begin
    SetEvent(EventHandle);
    CloseHandle(EventHandle);
  end;
  for Attempt := 1 to 150 do begin
    Sleep(100);
    if not CheckForMutexes(InstanceMutex) then begin
      Result := True;
      Exit;
    end;
  end;
end;

function HasWebViewAt(RootKey: Integer): Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(RootKey, RuntimeKey, 'pv', Version) and
    (Version <> '') and (Version <> '0.0.0.0');
end;

function HasWebView: Boolean;
begin
  Result := HasWebViewAt(HKLM32) or HasWebViewAt(HKCU32) or HasWebViewAt(HKCU64);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ExitCode: Integer;
begin
  Result := '';
  if not CloseWhereFile then begin
    Result := 'WhereFile 仍在运行。请从托盘退出，等待桌面图标恢复后重试。';
    Exit;
  end;
  if HasWebView then Exit;
  WizardForm.StatusLabel.Caption := '正在安装运行环境，请保持联网…';
  ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
  if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'),
    '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, ExitCode) then begin
    Result := '无法启动 WebView2 安装程序。请重试安装。';
    Exit;
  end;
  if not HasWebView then
    Result := 'WebView2 运行环境尚未安装成功。请确认网络连接后重试。错误码：' + IntToStr(ExitCode);
end;

function InitializeUninstall: Boolean;
begin
  Result := CloseWhereFile;
  if not Result then
    MsgBox('WhereFile 仍在运行。请从托盘退出，等待桌面图标恢复后重新卸载。', mbInformation, MB_OK);
end;
