# NEXUS — idiomas (i18n)

Carpeta compartida para el **monolito** (`NEXUS.V1.HTML`) y **NEXUS.separat**.

## Estructura

```
locales/
├── README.md
├── es.json              # Español (fuente principal)
├── en.json              # Inglés
├── nexus-i18n.js        # Motor: nexusT(), nexusSetLanguage(), data-i18n
├── nexus-locale-es.js   # Generado (bundle para file://)
├── nexus-locale-en.js   # Generado
└── _extract-report.json # Reporte del extractor (opcional)
```

## Uso en HTML

En el `<head>` del monolito (o `manifest.json` → `headScripts` en separat), **en este orden**:

```html
<script src="locales/nexus-locale-es.js"></script>
<script src="locales/nexus-locale-en.js"></script>
<script src="locales/nexus-i18n.js"></script>
```

Rutas relativas a la carpeta donde está el HTML (`NEXUS.PRO/` o `NEXUS.separat/`).

## API JavaScript

| Función | Descripción |
|---------|-------------|
| `nexusT('nav.modules.accounts')` | Traduce una clave |
| `nexusSetLanguage('en')` | Cambia idioma y refresca UI |
| `nexusGetLanguage()` | `'es'` \| `'en'` |
| `nexusApplyI18nDom()` | Aplica `data-i18n` y módulos |
| `nexusInitI18n()` | Se llama al cargar (automático) |

## Marcar textos en HTML

```html
<h2 data-i18n="tabs.database">Auditoría SSoT</h2>
<input data-i18n-placeholder="audit.searchPlaceholder" placeholder="Buscar...">
<button data-i18n-title="common.save" title="Guardar">...</button>
```

El texto entre etiquetas es el **fallback** en español si falta la clave.

## Claves organizadas

| Prefijo | Contenido |
|---------|-----------|
| `nav.modules.*` | Nombres del dashboard |
| `nav.moduleTitles.*` | Tooltips de módulos |
| `tabs.*` | Títulos de pestañas |
| `common.*` | Botones y filtros |
| `auth.*` | Login / bóvedas |
| `accounts.*` | Formulario de cuenta |
| `audit.*` | Auditoría |
| `settings.*` | Ajustes |
| `auto.*` | Cadenas extraídas automáticamente |

## Extraer más textos del monolito

```bash
node scripts/extract-i18n-from-monolith.mjs        # solo reporte
node scripts/extract-i18n-from-monolith.mjs --write # fusiona en es.json → auto.*
```

Traduce las entradas nuevas en `en.json` bajo `auto`.

## Regenerar bundles JS

```bash
node scripts/build-locale-bundles.mjs
```

Copia también a `NEXUS.separat/locales/`.

## Flujo recomendado

1. Añade clave en `es.json` y traducción en `en.json`.
2. `node scripts/build-locale-bundles.mjs`
3. En HTML usa `data-i18n="tu.clave"` o `nexusT('tu.clave')` en JS.
4. Tras editar monolito: `./sync-separat.sh` (copia `locales/`).

## Monolito vs separat

| Ubicación | Entrada |
|-----------|---------|
| `NEXUS.PRO/NEXUS.V1.HTML` | `<script src="locales/...">` |
| `NEXUS.separat/index.html` | Mismos scripts (tras build/sync) |

El selector **Idioma** está en Ajustes (`#set-language`).

## Qué subir a GitHub (para que cambie el idioma)

Puedes dejar los archivos **en la raíz del repo** (como en tu captura) **o** dentro de `locales/`. La app prueba ambas rutas.

### Mínimo en GitHub (raíz, junto a `index.html`)

| Archivo | ¿Para qué? |
|---------|------------|
| `index.html` | Debe ser la versión **nueva** con el cargador i18n en el `<head>` |
| `nexus-locale-es.js` | Traducciones ES (bundle) |
| `nexus-locale-en.js` | Traducciones EN (bundle) |
| `nexus-i18n.js` | Motor del cambio de idioma |
| `es.json` + `en.json` | Respaldo si los `.js` no cargan (GitHub Pages) |

No hace falta carpeta `locales/` si todo está en la raíz.

### ¿Qué es `node scripts`? (solo en tu Mac, no en GitHub)

Sirve **solo cuando editas** `es.json` / `en.json` en Cursor y quieres regenerar los `.js`:

```bash
cd "ruta/a/NEXUS.PRO"
node scripts/build-locale-bundles.mjs
```

Luego **vuelves a subir** a GitHub: `nexus-locale-es.js`, `nexus-locale-en.js` (y `nexus-i18n.js` si cambió).

**No necesitas Node en GitHub.** Si ya subiste los `.js` y los `.json`, no ejecutes nada más en el servidor.

### Si el idioma no cambia en Ajustes

1. Sube de nuevo **`index.html`** desde tu `NEXUS.V1.HTML` actualizado (el viejo no trae el cargador i18n).
2. Confirma que en la raíz están los 5 archivos de la tabla.
3. Abre el sitio, **recarga forzada** (Ctrl+F5 / vaciar caché).
4. En el navegador: F12 → pestaña **Red** → recarga → busca `nexus-i18n.js` (debe ser **200**, no 404).
5. En **Ajustes → Idioma → English** deberían cambiar títulos de módulos (Cuentas → Accounts, etc.).

**NEXUS.separat:** tras `./sync-separat.sh`, sube `index.html` + los mismos archivos i18n.
