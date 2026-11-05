# Quita ZapZap P5R de Windows.
#
#   powershell -ExecutionPolicy Bypass -File uninstall.ps1          quita accesos directos e inicio automatico
#   powershell -ExecutionPolicy Bypass -File uninstall.ps1 -Purge   ademas borra el ZapZap descargado,
#                                                                   su Python y tus tarjetas
#
# La sesion de WhatsApp y los ajustes de ZapZap (carpeta ZapZap en %LOCALAPPDATA%)
# nunca se borran solos.

param([switch]$Purge)
$Programs = [Environment]::GetFolderPath("Programs")
$Startup = [Environment]::GetFolderPath("Startup")
Remove-Item -ErrorAction SilentlyContinue "$Programs\ZapZap P5R*.lnk", "$Startup\ZapZap P5R.lnk"
Remove-ItemProperty -ErrorAction SilentlyContinue -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "ZapZap P5R"
Write-Host "Accesos directos quitados."

if ($Purge) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$env:LOCALAPPDATA\zapzap-p5r", "$env:LOCALAPPDATA\ZapZap-P5R"
    Write-Host "Borrado el ZapZap descargado y el estado del mod."
}
