<p align="center">
  <img src="docs/banner.png" alt="Kuro Player" width="100%">
</p>

<p align="center">
  <b>Tu videoteca de anime local</b>: cartelera con portadas, reproductor moderno estilo <i>glass</i>, color por GPU y soporte para prácticamente cualquier formato de video.
</p>

<p align="center">
  <img alt="Versión" src="https://img.shields.io/badge/versión-1.7.1-a855f7?style=for-the-badge">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%7C%2011-2563eb?style=for-the-badge&logo=windows&logoColor=white">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-44-22d3ee?style=for-the-badge&logo=electron&logoColor=white">
  <img alt="FFmpeg" src="https://img.shields.io/badge/FFmpeg-integrado-16a34a?style=for-the-badge&logo=ffmpeg&logoColor=white">
  <img alt="Idioma" src="https://img.shields.io/badge/idioma-español-f59e0b?style=for-the-badge">
  <img alt="Licencia MIT" src="https://img.shields.io/badge/licencia-MIT-64748b?style=for-the-badge">
</p>

---

## ✨ ¿Qué es?

**Kuro Player** convierte tus carpetas de anime en una cartelera como la de un servicio de streaming, pero **100 % local**: sin cuentas, sin anuncios y sin subir nada a internet. Cada subcarpeta es una serie y sus videos son los capítulos. Lo abres, eliges y sigues viendo justo donde lo dejaste.

Nació como reemplazo de PotPlayer para ver anime: mantiene lo mejor (ajuste de saturación y color, todos los formatos, atajos de teclado) con una interfaz moderna.

## 📥 Descargar

1. Ve a **[Releases](../../releases/latest)** y descarga `KuroPlayer-Setup-x.x.x.exe`.
2. Ejecútalo y sigue el instalador (puedes elegir la carpeta de instalación).
3. Abre **Kuro Player**, pulsa **Agregar carpeta** y elige la carpeta donde guardas tu anime.

> Windows puede mostrar el aviso *«Windows protegió su PC»* porque el instalador no tiene firma de pago. Pulsa **Más información → Ejecutar de todas formas**.

## 🖼️ Capturas

| Inicio | Cartelera |
|:---:|:---:|
| <img src="docs/screenshots/01-inicio.jpg" width="100%"> | <img src="docs/screenshots/02-cartelera.jpg" width="100%"> |
| **Vista de lista con detalles** | **Página de la serie** |
| <img src="docs/screenshots/03-cartelera-lista.jpg" width="100%"> | <img src="docs/screenshots/05-serie.jpg" width="100%"> |
| **Reproductor con lista de capítulos** | **Color y efectos (antes / después)** |
| <img src="docs/screenshots/06-reproductor.jpg" width="100%"> | <img src="docs/screenshots/07-color.jpg" width="100%"> |
| **Modo cine** | **¿Continuar o empezar de cero?** |
| <img src="docs/screenshots/08-modo-cine.jpg" width="100%"> | <img src="docs/screenshots/09-continuar.jpg" width="100%"> |
| **Filtro por género** | **Acerca de** |
| <img src="docs/screenshots/04-filtro-genero.jpg" width="100%"> | <img src="docs/screenshots/10-acerca-de.jpg" width="100%"> |

## 🚀 Características

### 🎞️ Cartelera
- Cada subcarpeta se convierte en una tarjeta con portada. Usa `cover.jpg`, `poster.jpg` o `portada.jpg` de la carpeta, la portada de internet o un cuadro del capítulo 1.
- Vista **cuadrícula** o **lista con detalles**, tres tamaños, filtro por letra, orden por nombre, recientes, última vista, puntuación, año o capítulos.
- **Filtro por género** y **categorías propias**: selecciona varias series y agrúpalas.
- **Temporadas en subcarpetas**: agrúpalas en una serie con pestañas o sepáralas en tarjetas, serie por serie.
- Detecta solo las **series y capítulos nuevos** que copies (marca «NUEVO» durante 7 días), sin volver a cargar todo.

### 🌐 Datos de internet
- Busca cada serie en **AniList** (con Kitsu y MyAnimeList como respaldo) y trae sinopsis en español, géneros, estudio, año, puntuación, portada y fondo.
- Entiende nombres **pegados**, con **guiones bajos**, **prefijos de orden** (`1_`, `M_`), incompletos o con errores de escritura.
- Sugiere **renombrar la carpeta** con el título oficial conservando tus prefijos. También puedes decirle «mantener mi nombre».

### ▶️ Reproductor
- **Continúa donde lo dejaste**: pregunta si seguir o empezar de cero y, si no eliges, continúa solo a los 5 segundos.
- Lista de capítulos lateral plegable, capítulo siguiente automático con cuenta atrás y ojo para marcar como visto.
- **Color por GPU (WebGL)**: brillo, contraste, gamma, saturación, *vibrance*, tono, temperatura, nitidez y viñeta, con preajustes («Anime vívido», «Cine», «Noche»…) y **comparación antes/después**. Global o por serie.
- **Modo cine** y **luz ambiental** alrededor del video con intensidad regulable.
- Subtítulos `.srt`, `.ass` y `.vtt` externos o incrustados, varias pistas de audio (anime dual), velocidad, cuadro a cuadro, capturas y **mini reproductor**.
- **Abrir con…** PotPlayer, VLC, MPC-HC, mpv y otros reproductores instalados, continuando en el mismo segundo.

### ⚡ Todos los formatos
- Reproduce directo lo que Chromium soporta (MP4, MKV, WebM, H.264, HEVC por hardware, VP9, AV1…).
- Lo demás (AVI, WMV, FLV, RMVB, Hi10P, AC3, DTS, Xvid/DivX…) se convierte **al vuelo con FFmpeg** usando la GPU (NVENC, Quick Sync o AMF) sin archivos temporales.

### 🏠 Inicio
- «Continuar viendo», **recomendación del día** (5 capítulos al azar), botón **«Elegir uno al azar»**, capítulos nuevos y series agregadas recientemente. Cada sección se puede activar o desactivar.

## ⌨️ Atajos de teclado

| Tecla | Acción | Tecla | Acción |
|---|---|---|---|
| `Espacio` / `K` | Reproducir / pausa | `F` / `Enter` | Pantalla completa |
| `←` `→` | ±5 s (configurable) | `Shift` + `←` `→` | ±30 s |
| `↑` `↓` | Volumen | `M` | Silencio |
| `N` / `P` | Capítulo siguiente / anterior | `L` | Mostrar / ocultar lista |
| `C` | Panel de color | `S` | Cambiar subtítulos |
| `T` | Modo cine | `G` | Luz ambiental |
| `[` `]` | Velocidad | `=` | Velocidad normal |
| `,` `.` | Cuadro a cuadro | `0`–`9` | Saltar al 0–90 % |
| `Inicio` / `Fin` | Principio / final | `Ctrl` + `S` | Captura de pantalla |
| `I` | Mini reproductor | `Ctrl` + `K` | Buscar |

## 📁 Cómo organizar tu anime

```
Anime/                         ← la carpeta que agregas
├── Sousou no Frieren/         ← una serie
│   ├── cover.jpg              ← (opcional) portada
│   ├── fondo.jpg              ← (opcional) fondo / banner
│   ├── Frieren - 01.mkv
│   ├── Frieren - 01.ass       ← subtítulo con el mismo nombre
│   └── Frieren - 02.mkv
└── Youjo Senki/
    ├── Temporada 1/           ← temporadas en subcarpetas
    └── Temporada 2/
```

El número de capítulo se detecta en nombres como `Serie - 05`, `S01E05`, `1x05`, `Ep 5`, `Capitulo 5`, `Serie_05` o `Hielo05`.

## 🛠️ Compilar desde el código

Requisitos: [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm start               # abrir en modo desarrollo
npm run build           # versión portátil en dist/win-unpacked
npm run build:setup     # instalador dist/KuroPlayer-Setup-x.x.x.exe
```

## 🔒 Tus datos

- Todo se guarda en tu equipo, en `%APPDATA%\Kuro Player` (biblioteca, progreso, portadas y ajustes).
- **Tus videos nunca se modifican ni se borran.** Solo cambia el nombre de una carpeta si tú aceptas la sugerencia.
- Solo se conecta a internet para buscar datos de las series (AniList, Kitsu, Jikan) y traducir sinopsis.
- En **Ajustes → Biblioteca → Restablecer Kuro Player** puedes dejarlo como recién instalado.

## 🧩 Hecho con

[Electron](https://www.electronjs.org) · [FFmpeg](https://ffmpeg.org) ([ffmpeg-static](https://github.com/eugeneware/ffmpeg-static)) · [AniList](https://anilist.co) · [Kitsu](https://kitsu.app) · [Jikan / MyAnimeList](https://jikan.moe)

## 📄 Licencia

El código de Kuro Player se publica bajo la [licencia MIT](LICENSE).

El instalador incluye **FFmpeg** y **FFprobe** (de [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) y [ffprobe-static](https://github.com/joshwnj/ffprobe-static)), que se distribuyen con su propia licencia (GPL). Su código fuente está disponible en [ffmpeg.org](https://ffmpeg.org/download.html). Kuro Player no incluye ni distribuye ningún video: solo reproduce los archivos que tú tengas.

---

<p align="center">Hecho con 💜 para ver anime como se merece.</p>
