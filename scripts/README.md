# Scripts del USB

Utilidades temporales para mantenimiento del pen.

## encrypt-icons.exe

Cifra los iconos existentes de `icons/`, los renombra a 64 caracteres hex y actualiza las referencias de USB-Vault.

Uso normal, desde la raiz del pen:

```powershell
.\scripts\encrypt-icons.exe
```

Solo comprobar referencias, sin modificar nada:

```powershell
.\scripts\encrypt-icons.exe --check
```

Importar iconos antiguos desde una carpeta, cifrarlos y actualizar referencias:

```powershell
.\scripts\encrypt-icons.exe --import-missing "C:\Users\Roger Gomez Martinez\Pictures"
```

Si la unidad cambia o lo ejecutas desde otra carpeta:

```powershell
.\scripts\encrypt-icons.exe F:\
```

Pide la contrasena maestra. Salta los iconos que ya esten correctos.

## usb-backup.exe

Crea un ZIP con los `.dat` actuales de `data\`, todos los archivos de `icons\` y todos los archivos de `uploads\`.

Uso normal, desde la raiz del pen:

```powershell
.\scripts\usb-backup.exe
```

Tambien puedes ejecutarlo desde cualquier carpeta usando la ruta completa:

```powershell
F:\scripts\usb-backup.exe
```

Guarda el backup por defecto en:

```text
backups\usb-backup-YYYYMMDD-HHMMSS.zip
```

Si la unidad cambia o quieres indicar la raiz manualmente:

```powershell
.\scripts\usb-backup.exe F:\
```

Si quieres elegir tambien el destino del ZIP:

```powershell
.\scripts\usb-backup.exe F:\ D:\Backups\usb.zip
```

Solo incluye los `.dat` activos de `data\`. No incluye historicos de `data\backups`.
