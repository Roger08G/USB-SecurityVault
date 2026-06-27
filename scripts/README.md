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
.\scripts\encrypt-icons.exe --import-missing "C:\Users\Roger Gómez Martínez\Pictures"
```

Si la unidad cambia o lo ejecutas desde otra carpeta:

```powershell
.\scripts\encrypt-icons.exe F:\
```

Pide la contrasena maestra. Salta los iconos que ya esten correctos.
