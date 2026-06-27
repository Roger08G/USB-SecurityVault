# Scripts del USB

Utilidades temporales para mantenimiento del pen.

## encrypt-icons.exe

Cifra los iconos existentes de `icons/` para que USB-Vault los pueda seguir mostrando.

Uso normal, desde la raiz del pen:

```powershell
.\scripts\encrypt-icons.exe
```

Si la unidad cambia o lo ejecutas desde otra carpeta:

```powershell
.\scripts\encrypt-icons.exe F:\
```

Pide la contrasena maestra. Salta los iconos que ya esten cifrados.
