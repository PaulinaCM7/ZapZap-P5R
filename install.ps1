# Instala ZapZap P5R en Windows: ZapZap desde GitHub (en su propio entorno de
# Python) + el mod de Persona 5 + accesos directos en el menu Inicio.
#
#   powershell -ExecutionPolicy Bypass -File install.ps1              instala
#   powershell -ExecutionPolicy Bypass -File install.ps1 -Autostart   ademas, abrir al iniciar sesion
#
# Requisito: Python 3.10 o superior desde python.org (marca "Add python.exe to PATH").

param([switch]$Autostart)
$ErrorActionPreference = "Stop"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

# Python del sistema (el lanzador py.exe si existe).
$Python = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
    $Python = (& py -3 -c "import sys; print(sys.executable)").Trim()
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $Python = (& python -c "import sys; print(sys.executable)").Trim()
}
if (-not $Python -or -not (Test-Path $Python)) {
    Write-Host "No encontre Python 3. Instalalo desde https://www.python.org/downloads/ (marca 'Add python.exe to PATH')." -ForegroundColor Red
    exit 1
}
$PythonW = Join-Path (Split-Path $Python) "pythonw.exe"
if (-not (Test-Path $PythonW)) { $PythonW = $Python }

Write-Host "-> ZapZap desde GitHub (la primera vez descarga PyQt6, ~200 MB)..."
& $Python "$Here\p5r_mod\updater.py" install
if ($LASTEXITCODE -ne 0) { Write-Host "Fallo la instalacion. Revisa $env:LOCALAPPDATA\zapzap-p5r\updater.log" -ForegroundColor Red; exit 1 }
& $Python "$Here\p5r_mod\updater.py" check
if ($LASTEXITCODE -ne 0) { exit 1 }

$Launcher = "$Here\p5r_mod\launcher.py"
$Icon = "$Here\desktop\zapzap-p5r.ico"
$Shell = New-Object -ComObject WScript.Shell
$Programs = [Environment]::GetFolderPath("Programs")

function New-Shortcut($Path, $Arguments, $Name) {
    $s = $Shell.CreateShortcut($Path)
    $s.TargetPath = $PythonW
    $s.Arguments = "`"$Launcher`" $Arguments".Trim()
    $s.WorkingDirectory = $Here
    $s.IconLocation = $Icon
    $s.Description = $Name
    $s.Save()
}

New-Shortcut "$Programs\ZapZap P5R.lnk" "" "ZapZap con estetica Persona 5 Royal y tarjetas de aviso"
New-Shortcut "$Programs\ZapZap P5R (original sin mod).lnk" "--original" "El mismo ZapZap sin el mod"
New-Shortcut "$Programs\ZapZap P5R (modo seguro).lnk" "--safe" "ZapZap P5R con el mod desactivado"
Write-Host "OK Accesos directos en el menu Inicio"

if ($Autostart) {
    $Startup = [Environment]::GetFolderPath("Startup")
    New-Shortcut "$Startup\ZapZap P5R.lnk" "--hideStart" "ZapZap P5R al iniciar sesion"
    Write-Host "OK Inicio automatico"
}

Write-Host ""
Write-Host "Listo. Abre 'ZapZap P5R' desde el menu Inicio."
Write-Host "La primera vez escanea el codigo QR con tu telefono (WhatsApp -> Dispositivos vinculados)."
