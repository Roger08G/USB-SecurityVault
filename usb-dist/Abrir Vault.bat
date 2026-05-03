@echo off
:: USB Vault launcher - double-click to open
:: Runs the vault from the same folder as this script (portable, nothing installed on host)
cd /d "%~dp0"
start "" "usb-vault.exe"
