#!/bin/bash
# Notification hook: системне повідомлення, коли Claude Code чекає на ввід автора.
# Рядок повідомлення лишається літеральним: підстановка даних з хука у osascript
# відкрила б шлях для інжекції AppleScript.
# Текст - Віслюк зі «Шрека 2»: так автор просить нагадувати, що Claude чекає
# (21.11.2026).
osascript -e 'display notification "Шрек, ми вже приїхали?" with title "⁉️ Claude Code" sound name "Ping"'

# Альтернативи для інших систем, якщо проєкт колись перенесуть:
# Linux: notify-send 'Claude Code чекає' 'Шрек, ми вже приїхали?'
# Windows: powershell.exe -Command "Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(5000, 'Claude Code чекає', 'Шрек, ми вже приїхали?', 'Info'); Start-Sleep 6; $n.Dispose()"
