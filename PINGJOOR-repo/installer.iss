[Setup]
AppName=PINGJOOR
AppVersion=2.0
AppPublisher=PINGJOOR
DefaultDirName={localappdata}\PINGJOOR
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
OutputDir=out
OutputBaseFilename=PINGJOOR-Setup
SetupIconFile=build\icon.ico
UninstallDisplayIcon={app}\PINGJOOR.exe
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
WizardStyle=modern

[Files]
Source: "build\PINGJOOR.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "build\Microsoft.Web.WebView2.Core.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "build\Microsoft.Web.WebView2.WinForms.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "build\WebView2Loader.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "build\bridge.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "build\icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "build\ui\*"; DestDir: "{app}\ui"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "build\WebView2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: NeedRuntime

[Icons]
Name: "{autodesktop}\PINGJOOR"; Filename: "{app}\PINGJOOR.exe"; IconFilename: "{app}\icon.ico"
Name: "{autoprograms}\PINGJOOR"; Filename: "{app}\PINGJOOR.exe"; IconFilename: "{app}\icon.ico"

[Run]
Filename: "{tmp}\WebView2Setup.exe"; Parameters: "/silent /install"; Check: NeedRuntime; StatusMsg: "Installing WebView2 Runtime..."
Filename: "{app}\PINGJOOR.exe"; Description: "Run PINGJOOR"; Flags: nowait postinstall skipifsilent

[Code]
function NeedRuntime: Boolean;
begin
  Result := not (RegKeyExists(HKLM32, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}') or
                 RegKeyExists(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'));
end;
