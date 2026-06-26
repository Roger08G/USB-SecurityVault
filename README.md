# USB Vault

USB Vault es una aplicación portable (Tauri + Rust + React) para almacenar contraseñas y variables de entorno cifradas directamente en un pendrive. Está diseñada para ejecutarse desde la unidad USB sin dejar datos persistentes en el equipo host.

![imagen](./assets/Captura%20de%20pantalla%202026-06-05%20204613.png)

> Nota: No existe una solución 100% indetectable a nivel forense en equipos ajenos. Esta herramienta minimiza trazas, pero sigue las recomendaciones de seguridad en el apartado "Trazas y privacidad".

![imagen](./assets/Captura%20de%20pantalla%202026-06-05%20204710.png)

## Características

- Vault cifrado con XChaCha20-Poly1305 y derivación de clave (Argon2).
- Datos persistentes junto al ejecutable, con los `.dat` dentro de `data/` (`data/vault.dat`, `data/config.dat`, `data/backups/`) e iconos en `icons/`.
- Backup automático antes de cada guardado (retención: últimas 10 copias).
- Editor de variables (modo `Variables`) para guardar archivos tipo `.env` dentro del vault.
- UI portable basada en Tauri (WebView2 en Windows). WebView2 user-data redirigido al USB y borrado al salir.

## Estructura de archivos (en la unidad USB)

```
TuPen/
  usb-vault.exe        # El binario compilado (portable)
  Abrir Vault.bat      # Launcher (doble-clic)
  autorun.inf          # Sólo para icono/label (autorun limitado en Windows modernos)
  data/
    vault.dat          # Archivo cifrado del vault (se crea al inicializar)
    config.dat         # Estado no secreto (rate-limit, etc.)
    backups/           # Copias automáticas cifradas (últimas 10)
  icons/               # Imagenes subidas para cuentas
```

## Desarrollo (modo local)

Requisitos: Node.js, Rust (stable), Cargo, Tauri prerequisitos en Windows (Visual Studio Build Tools, etc.).

1. Instalar dependencias frontend:

```bash
npm install
```

2. Ejecutar en modo desarrollo (frontend + Tauri):

```bash
npm run dev
# en otra terminal
cd src-tauri
cargo build
# o para dev completo con tauri: npm run tauri dev
```

3. Build de producción (genera el `.exe`):

```bash
npm run build
cd src-tauri
cargo build --release
# o usar el wrapper de tauri
npm run tauri build
```

El ejecutable de release estará en `src-tauri/target/release/usb-vault.exe`.

## Preparar la unidad USB (distribución portable)

1. Copia `usb-vault.exe` al directorio raíz del pendrive.
2. Copia `Abrir Vault.bat` y `autorun.inf` (estos últimos facilitan abrir y mostrar icono; autorun está limitado en Windows modernos).
3. Ejecuta `usb-vault.exe` desde la unidad (double-click) o usa `Abrir Vault.bat`.

### Nota sobre `autorun.inf`
Windows Vista y posteriores bloquean la ejecución automática desde USB por seguridad. `autorun.inf` solo sirve para establecer icono/label en el explorador; no garantiza ejecución automática.

## Actualizaciones del binario

Para actualizar la aplicación en el pen basta con reemplazar `usb-vault.exe` por la nueva versión. Como los datos (`data/vault.dat`, `data/config.dat`, `data/backups/`) están en una carpeta separada, no se perderán.

## Seguridad y privacidad (qué cubre, qué no)

- Los datos están cifrados con tu contraseña; nadie puede leer `vault.dat` sin la contraseña.
- La app evita escribir caché WebView2 en `AppData` redirigiéndola a la propia unidad USB (`.wv`) y borra ese directorio al salir.

Limitaciones que no puede controlar la app:

- El sistema operativo puede dejar artefactos forenses (Prefetch, Amcache, UserAssist, registros de ejecución). Para minimizar trazas en un host ajeno:
  - Ejecuta siempre desde la unidad USB (no copies el exe al disco local).
  - No introduzcas la contraseña en presencia de cámaras o keyloggers.
  - Tras su uso, limpia manualmente Prefetch / UserAssist si el host lo permite (herramientas como BleachBit). Algunos artefactos requieren privilegios de administrador para limpiarse.

## Respaldos y recuperación

- El vault crea una copia en `data/backups/` antes de cada guardado y mantiene las últimas 10 copias.
- Para restaurar, sustituye `data/vault.dat` por una copia antigua de `data/backups/` y abre la app con la contraseña correcta.

## Operaciones seguras

- Cerrar la app antes de extraer la unidad.
- Esperar a que el SO termine operaciones de escritura (asegurar que el indicador de actividad del USB está inactivo) antes de extraer.

## Comprobaciones finales para producción

- Verificar código firmado (opcional): firma el ejecutable con un certificado para evitar alertas de Windows SmartScreen.
- Pruebas de integridad: prueba inicio de vault, creación de cuentas, guardar/restaurar backups y reemplazo del exe.
- Revisión de dependencias y actualizaciones de seguridad para Rust/JS.

## Troubleshooting

- Si el frontend no carga en Windows, asegúrate de que WebView2 está instalado en el host o que el runtime redistributable está presente.
- Si el binario no arranca, ejecuta en `cmd` para capturar errores y revisar dependencias de runtime.

---

Si quieres, genero también:
- Un script de PowerShell que automatice la copia al USB y verifique permisos.
- Instrucciones para firmar el ejecutable en Windows.

¿Te genero alguno de esos ahora?
