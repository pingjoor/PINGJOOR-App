$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$build = Join-Path $root "build"
$out = Join-Path $root "out"
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $build | Out-Null

Write-Host "Publishing PINGJOOR for Windows x64..."
dotnet publish (Join-Path $root "PINGJOOR.csproj") -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o $build
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed." }

Copy-Item (Join-Path $root "app/bridge.js") (Join-Path $build "bridge.js") -Force
Copy-Item (Join-Path $root "app/icon.ico") (Join-Path $build "icon.ico") -Force
Copy-Item (Join-Path $root "app/ui") (Join-Path $build "ui") -Recurse -Force

$webviewBootstrapper = Join-Path $build "WebView2Setup.exe"
Write-Host "Downloading Microsoft WebView2 Evergreen Bootstrapper..."
Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $webviewBootstrapper

$required = @("PINGJOOR.exe", "Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.WinForms.dll", "WebView2Loader.dll")
foreach ($file in $required) {
    if (-not (Test-Path (Join-Path $build $file))) { throw "Required publish output missing: $file" }
}
if (-not (Test-Path (Join-Path $build "ui/index.html"))) { throw "UI entry file is missing." }

Write-Host "Compiling installer..."
$iscc = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"
if (-not (Test-Path $iscc)) { $iscc = Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe" }
if (-not (Test-Path $iscc)) { throw "Inno Setup 6 compiler (ISCC.exe) was not found." }

& $iscc (Join-Path $root "installer.iss")
if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed with exit code $LASTEXITCODE." }

$installer = Join-Path $out "PINGJOOR-Setup.exe"
if (-not (Test-Path $installer)) { throw "Installer output was not found: $installer" }
Write-Host "SUCCESS: $installer"