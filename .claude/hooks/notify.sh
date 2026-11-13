#!/bin/bash
# Notification hook: системне повідомлення, коли Claude Code чекає на ввід автора.
# Рядок повідомлення лишається літеральним: підстановка даних з хука у osascript
# відкрила б шлях для інжекції AppleScript.
osascript -e 'display notification "Claude is waiting for your input" with title "Claude Code"'

# Альтернативи для інших систем, якщо проєкт колись перенесуть:
# Linux: notify-send 'Claude Code' 'Claude is waiting for your input'
# Windows: powershell.exe -Command "Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(5000, 'Claude Code', 'Claude is waiting for your input', 'Info'); Start-Sleep 6; $n.Dispose()"
