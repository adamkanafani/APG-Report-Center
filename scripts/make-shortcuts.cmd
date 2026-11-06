@echo off
rem Makes the "APG Report Center" shortcut, with the APG spire icon, in the app folder itself -- so
rem right-click > Send to > Desktop on it gives a desktop icon that already has the spire -- and, with
rem "desktop", on the desktop as well. Run by Setup (desktop too) and Update.bat (app folder only).
rem A .bat file can't carry an icon of its own; a shortcut can. Shortcuts hold full paths, so they're
rem made on each computer rather than kept in the repo (see .gitignore).
powershell -NoProfile -Command "$app = (Resolve-Path '%~dp0..').Path; function Make($dir) { $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $dir 'APG Report Center.lnk')); $lnk.TargetPath = (Join-Path $app 'Start Report Center.bat'); $lnk.WorkingDirectory = $app; $lnk.IconLocation = (Join-Path $app 'src\app\favicon.ico'); $lnk.Description = 'APG Report Center'; $lnk.Save() }; Make $app; if ('%~1' -eq 'desktop') { Make ([Environment]::GetFolderPath('Desktop')) }"
