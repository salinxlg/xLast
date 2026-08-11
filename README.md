<div align="center">

<img src="https://cdn-icons-png.flaticon.com/512/3904/3904299.png" alt="xLast" width="112">

<br>

# xLast

### Releases consistentes, sin pasos repetitivos.

Automatiza el versionado, el build, el commit y la publicación de tus proyectos.

<sub>v7.0.1 · Node.js 18+ · Windows 10/11</sub>

<br><br>

**Creado por [Roger Salinas](https://github.com/salinxlg) para Dexly Studios.**

</div>

<br><br>

## Qué hace xLast

xLast convierte un release completo en un solo comando. En cada publicación:

1. Localiza la raíz del repositorio Git.
2. Crea o actualiza `xrelease.json`.
3. Calcula la próxima versión y el build diario.
4. Ejecuta `git add .`.
5. Crea el commit con el formato oficial.
6. Ejecuta `git push`.

El mensaje generado utiliza exactamente este formato:

```text
Release 2026-08-11 • Build: X-2026081101 • v7.1.0
```

GitHub convierte ese commit en una URL similar a:

```text
https://github.com/usuario/repositorio/commit/commit-id
```

<br><br>

## Instalación

### Requisitos

- Windows 10 u 11.
- Node.js 18 o superior.
- npm.
- Git.
- Un repositorio con remoto configurado para publicar.
- `user.name` y `user.email` configurados en Git.

### Instalar

Extrae el ZIP y ejecuta:

```text
install.cmd
```

El instalador registra `xlast` como comando global. Después puedes abrir una terminal nueva y verificarlo:

```powershell
xlast --version
xlast --doctor
```

<br><br>

## Inicio rápido

Abre una terminal dentro de cualquier repositorio y publica un patch:

```powershell
xlast p
```

Si `xrelease.json` todavía no existe, xLast lo crea y publica la primera versión como `v7.0.0`. El tipo enviado queda guardado para los siguientes releases.

La próxima vez, los incrementos funcionan así:

| Comando | Tipo | Ejemplo |
| --- | --- | --- |
| `xlast p` | Patch | `7.0.0` → `7.0.1` |
| `xlast mn` | Minor | `7.0.1` → `7.1.0` |
| `xlast mj` | Major | `7.1.0` → `8.0.0` |

También puedes escribir los nombres completos:

```powershell
xlast patch
xlast minor
xlast major
```

<br><br>

## Selector interactivo

Ejecuta xLast sin argumentos:

```powershell
xlast
```

Cuando el proyecto está desbloqueado, verás un selector para elegir:

- Patch.
- Minor.
- Major.
- Bloquear el último tipo.
- Resetear el versionado.
- Cancelar.

El selector muestra la versión resultante antes de publicar.

<br><br>

## Lock y unlock

Después de crear al menos un release, puedes bloquear el último tipo utilizado:

```powershell
xlast lock
```

Por ejemplo, si el último release fue un patch, cada ejecución de `xlast` repetirá patch automáticamente:

```powershell
xlast
xlast
xlast
```

Para volver al selector:

```powershell
xlast unlock
```

Mientras el bloqueo esté activo, el encabezado muestra el tipo fijado y recuerda el comando de desbloqueo.

<br><br>

## Reset controlado

Para reiniciar el versionado del proyecto:

```powershell
xlast reset
```

xLast pide confirmación y deja el próximo release en `v7.0.0`. El contador del build actual se conserva para evitar identificadores duplicados durante el mismo día.

En automatizaciones sin terminal interactiva:

```powershell
xlast reset --yes
```

Reset no ejecuta `git add`, `commit` ni `push`. El cambio queda listo para incluirse en el próximo release.

<br><br>

## Builds diarios

Cada release recibe un identificador:

```text
X-YYYYMMDDNN
```

| Segmento | Significado |
| --- | --- |
| `X-` | Prefijo del build. |
| `YYYYMMDD` | Fecha local del release. |
| `NN` | Secuencia del día, comenzando en `01`. |

Ejemplos del mismo día:

```text
X-2026081101
X-2026081102
X-2026081103
```

Al cambiar la fecha, la secuencia vuelve a `01`.

<br><br>

## xrelease.json

El manifiesto pertenece a cada proyecto y se guarda en la raíz del repositorio. Puedes crearlo sin publicar mediante:

```powershell
xlast init
```

Su estructura inicial es:

```json
{
  "schemaVersion": 1,
  "product": "xLast",
  "author": "Roger Salinas",
  "vendor": "Dexly Studios",
  "version": "7.0.0",
  "releaseCount": 0,
  "lastType": null,
  "locked": false,
  "build": {
    "date": null,
    "sequence": 0,
    "id": null
  },
  "lastRelease": null
}
```

Después de publicar, `lastRelease` conserva la versión, tipo, fecha, build y mensaje exacto del último commit.

No necesitas editar este archivo manualmente.

<br><br>

## Estado del proyecto

Consulta el seguimiento actual con:

```powershell
xlast status
```

Muestra:

- Repositorio y rama.
- Versión actual.
- Cantidad de releases.
- Último tipo utilizado.
- Estado de lock.
- Último build.

`status`, `init`, `lock`, `unlock` y `reset` pueden utilizarse antes de configurar el remoto. El remoto solo es obligatorio cuando se publica.

<br><br>

## Recuperar un push fallido

xLast actualiza el manifiesto y crea el commit antes de publicar. Si GitHub rechaza el push o se pierde la conexión, xLast no crea otra versión automáticamente.

Corrige el problema y ejecuta:

```powershell
xlast push
```

Este comando solo vuelve a ejecutar el push del commit pendiente. No incrementa la versión ni el build.

<br><br>

## Simular un release

Para revisar el resultado sin modificar archivos ni ejecutar Git:

```powershell
xlast p --dry-run
xlast mn --dry-run
xlast mj --dry-run
```

La simulación muestra versión, build, mensaje y comandos previstos.

<br><br>

## Comandos disponibles

| Comando | Descripción |
| --- | --- |
| `xlast` | Abre el selector o repite el tipo bloqueado. |
| `xlast p` | Publica un patch. |
| `xlast mn` | Publica un minor. |
| `xlast mj` | Publica un major. |
| `xlast init` | Crea `xrelease.json` sin publicar. |
| `xlast status` | Muestra el estado del proyecto. |
| `xlast lock` | Bloquea el último tipo utilizado. |
| `xlast unlock` | Desbloquea el selector. |
| `xlast reset` | Reinicia el versionado a `7.0.0`. |
| `xlast push` | Reintenta un push sin crear otra versión. |
| `xlast --doctor` | Diagnostica el entorno. |
| `xlast --developer` | Muestra la autoría. |
| `xlast --version` | Muestra la versión instalada. |
| `xlast --help` | Muestra la ayuda integrada. |

<br><br>

## Opciones

| Opción | Descripción |
| --- | --- |
| `--dry-run` | Simula sin escribir ni ejecutar Git. |
| `--yes`, `-y` | Confirma un reset sin interacción. |
| `--verbose` | Muestra la salida completa de Git. |
| `--no-animation` | Desactiva animaciones. |
| `--no-color` | Desactiva colores. |
| `--doctor` | Revisa Node.js, Git, identidad y remoto. |
| `--developer` | Muestra Roger Salinas y Dexly Studios. |
| `--version`, `-v` | Muestra `xlast 7.0.1`. |
| `--help`, `-h` | Abre la ayuda. |

<br><br>

## Comportamiento de Git

xLast utiliza procesos directos, sin construir comandos mediante una shell:

```text
git add .
git commit -m "Release YYYY-MM-DD • Build: X-YYYYMMDDNN • vX.Y.Z"
git push
```

Si la rama todavía no tiene upstream, la primera publicación utiliza automáticamente:

```text
git push --set-upstream origin rama
```

Si el remoto no se llama `origin`, xLast utiliza el primer remoto disponible.

Importante: `git add .` incluye archivos nuevos, modificados y eliminados dentro del repositorio. Revisa tus cambios antes de ejecutar un release.

<br><br>

## Diagnóstico

Ejecuta:

```powershell
xlast --doctor
```

xLast comprueba:

- Node.js 18 o superior.
- Git disponible.
- Repositorio actual.
- Identidad `user.name` y `user.email`.
- Remoto configurado.

<br><br>

## Desinstalación

Ejecuta:

```text
uninstall.cmd
```

O utiliza npm:

```powershell
npm uninstall -g @dexly/xlast
```

Los archivos `xrelease.json` de tus proyectos no se eliminan.

<br><br>

## Información del proyecto

- Producto: xLast.
- Versión: `7.0.1`.
- Autor y desarrollador: Roger Salinas.
- Estudio: Dexly Studios.
- Lema: `Build without limits`.
- Runtime: Node.js 18 o superior.
- Licencia: UNLICENSED.

<br><br><br>

<div align="center">

  <img src="https://github.com/salinxlg/HelloAuth/raw/main/docs/sign.svg" alt="Roger Salinas" width="205">

</div>
