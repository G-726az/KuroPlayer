/* Interfaz en inglés: la app está escrita en español y, si se elige inglés, este módulo traduce
   los textos de la pantalla al vuelo (frases exactas, patrones con números y fragmentos). */
const I18N = (() => {
  let lang = 'es';
  try { lang = localStorage.getItem('kp-lang') || 'es'; } catch (e) { /* */ }

  // frases completas (el texto de un nodo, sin espacios al borde)
  const EN = {
    // barra superior, navegación
    'Inicio': 'Home', 'Cartelera': 'Library', 'Reproduciendo': 'Now playing', 'Ajustes': 'Settings', 'Agregar carpeta': 'Add folder',
    'Volver a escanear': 'Rescan', 'Buscar anime o capítulo...': 'Search anime or episode...', 'Nuevo': 'New', 'Perfil': 'Profile',
    'Buscar en Anime...': 'Search in Anime...', 'Suelta carpetas para agregarlas a la cartelera': 'Drop folders to add them to the library',
    'Tu videoteca está vacía': 'Your video library is empty', 'Agregar carpeta de anime': 'Add anime folder',
    'Agrega una carpeta para llenar la cartelera.': 'Add a folder to fill your library.', 'Primero agrega una carpeta': 'Add a folder first',
    // inicio
    'Continuar viendo': 'Continue watching', 'Capítulos nuevos': 'New episodes', 'Agregados recientemente': 'Recently added', 'Recientes': 'Recent',
    'Recomendación del día': 'Pick of the day', 'Elegir uno al azar': 'Pick one at random', 'Ver otra selección': 'Show another selection', 'Otra selección': 'Another selection',
    'Ver todo': 'See all', 'Ver serie': 'View series', 'Ver capítulos': 'View episodes', 'Reproducir': 'Play', 'Continuar': 'Continue', 'Ver desde el inicio': 'Watch from the start',
    'Reproducir desde el inicio': 'Play from the start', 'Desde el inicio': 'From the start', 'Recién agregado': 'Just added', 'NUEVO': 'NEW', 'Última vista': 'Last watched',
    'Series que dejaste a medias.': 'Series you left halfway.', 'Capítulos agregados en los últimos 7 días.': 'Episodes added in the last 7 days.',
    'Últimas series agregadas a la biblioteca.': 'Latest series added to the library.', 'Ocultar': 'Hide', 'Leer más': 'Read more', 'Ver menos': 'Show less',
    'Ocultar esta sección (se reactiva en Ajustes → Apariencia)': 'Hide this section (turn it back on in Settings → Appearance)',
    'Recomendación oculta · reactívala en Ajustes → Apariencia': 'Pick hidden · turn it back on in Settings → Appearance',
    'Limpiar «Continuar viendo»': 'Clear «Continue watching»', '«Continuar viendo» limpiado': '«Continue watching» cleared',
    'Quitado de «Continuar viendo» (vuelve si sigues viéndolo)': 'Removed from «Continue watching» (it returns if you keep watching)',
    // cartelera
    'Ordenar:': 'Sort:', 'Título': 'Title', 'Año': 'Year', 'Puntuación': 'Score', 'Tamaño': 'Size', 'Seleccionar': 'Select', 'Seleccionar todas las visibles': 'Select all visible',
    'Cuadrícula de portadas': 'Poster grid', 'Lista con detalles': 'Detailed list', 'Lista': 'List', 'Vista de lista con detalles': 'Detailed list view', 'Todos': 'All', 'Todas': 'All',
    'Nada coincide con el filtro.': 'Nothing matches the filter.', 'Géneros:': 'Genres:', 'Categorías': 'Categories', 'Agregar a una categoría...': 'Add to a category...',
    'Seleccionar varias series para asignarles una categoría': 'Select several series to assign them a category', 'Quitar categoría': 'Remove category',
    'Agregar categoría': 'Add category', 'Renombrar categoría': 'Rename category', 'Escribe un nombre de categoría': 'Type a category name', 'Cancelar': 'Cancel', 'Guardar': 'Save', 'Aplicar': 'Apply',
    'Aceptar': 'OK', 'Cerrar': 'Close', 'Eliminar': 'Delete', 'Quitar': 'Remove', 'Editar': 'Edit', 'Listo': 'Done', 'Sí': 'Yes', 'No': 'No', '¿Seguro?': 'Are you sure?',
    'Estas series no tienen categorías propias.': 'These series have no custom categories.', 'Sin categorías propias': 'No custom categories',
    'Los géneros de internet no se pueden quitar; solo las categorías que creaste tú.': 'Online genres can\'t be removed; only the categories you created.',
    // serie
    'Capítulos': 'Episodes', 'Capítulo': 'Episode', 'Temporada': 'Season', 'Carpeta': 'Folder', 'Abrir carpeta': 'Open folder', 'Mostrar en el explorador': 'Show in Explorer',
    'Abrir con': 'Open with', 'Abrir con…': 'Open with…', 'Abrir con...': 'Open with...', 'Abrir con otro reproductor': 'Open with another player', 'Editar título / sinopsis': 'Edit title / synopsis',
    'Buscar en internet': 'Search online', 'Buscar en internet...': 'Search online...', 'Cambiar datos de internet...': 'Change online data...', 'Quitar datos de internet': 'Remove online data',
    'Renombrar carpeta al nombre oficial...': 'Rename folder to the official name...', 'Separar temporadas en series propias': 'Split seasons into separate series',
    'Marcar como visto': 'Mark as watched', 'Marcar como no visto': 'Mark as unwatched', 'Marcar todo como visto': 'Mark all as watched', 'Borrar progreso de la serie': 'Clear series progress',
    'Progreso de la serie borrado': 'Series progress cleared', 'Visto · clic para marcar como no visto': 'Watched · click to mark as unwatched', 'marcado como no visto': 'marked as unwatched',
    'Filtrar capítulos...': 'Filter episodes...', 'Usar cuadro actual del video': 'Use current video frame', 'Portada creada a partir del cuadro actual': 'Cover created from the current frame',
    'Quitar portada personalizada': 'Remove custom cover', 'Quitar fondo personalizado': 'Remove custom background', 'Cambiar portada...': 'Change cover...', 'Cambiar fondo...': 'Change background...',
    'Sin sinopsis · clic en «Editar» para escribir una o buscarla en internet': 'No synopsis · click «Edit» to write one or search online',
    'Sin descripción. Usa Ajustes → Datos de internet, o clic derecho → Buscar en internet.': 'No description. Use Settings → Online data, or right-click → Search online.',
    'Clic para expandir': 'Click to expand', 'Título que se muestra': 'Displayed title', 'Sinopsis propia': 'Custom synopsis', 'Vacío = usar la descripción de internet': 'Empty = use the online description',
    'Descripción, notas, año, estudio...': 'Description, notes, year, studio...', 'Nombre actual': 'Current name', 'Nombre nuevo': 'New name', 'Nombre no válido': 'Invalid name',
    'Ya existe una carpeta con ese nombre': 'A folder with that name already exists', 'Escribe un nombre válido': 'Type a valid name',
    'Cambia el nombre real de la carpeta en el disco. Tu progreso, portada y datos se conservan.': 'Renames the actual folder on disk. Your progress, cover and data are kept.',
    'Esta serie es una carpeta raíz de la biblioteca; renómbrala desde el explorador': 'This series is a library root folder; rename it from Explorer',
    'Windows no permite renombrarla: algún archivo está abierto (cierra el video o el explorador en esa carpeta)': 'Windows won\'t allow renaming it: a file is open (close the video or Explorer in that folder)',
    'Serie no encontrada, vuelve a escanear': 'Series not found, rescan', 'Película': 'Movie', 'Películas': 'Movies', 'película': 'movie', 'películas': 'movies',
    'capítulo': 'episode', 'capítulos': 'episodes', 'título': 'title', 'títulos': 'titles', 'Serie': 'Series', 'Series': 'Series',
    'Estudio': 'Studio', 'Estado': 'Status', 'Formato': 'Format', 'Géneros': 'Genres', 'Duración': 'Duration', 'Episodios': 'Episodes', 'Fuente': 'Source', 'Emisión': 'Aired',
    'Te quedaste en': 'You stopped at', '¿Continuar donde lo dejaste?': 'Continue where you left off?', 'Continuar (Enter)': 'Continue (Enter)',
    'Empezar el capítulo desde 0:00 (tecla Inicio)': 'Start the episode from 0:00 (Home key)',
    // reproductor
    'Anterior': 'Previous', 'Siguiente': 'Next', 'Anterior (P)': 'Previous (P)', 'Siguiente (N)': 'Next (N)', 'Siguiente capítulo': 'Next episode', 'Siguiente en': 'Next in',
    'Reproducir / Pausa (Espacio)': 'Play / Pause (Space)', 'Pausa': 'Pause', 'Silencio': 'Mute', 'Silencio (M)': 'Mute (M)', 'Volumen': 'Volume', 'Velocidad': 'Speed', 'Velocidad ([ ])': 'Speed ([ ])',
    'Subtítulos': 'Subtitles', 'Subtítulos (S)': 'Subtitles (S)', 'Subtítulos desactivados': 'Subtitles off', 'Pista de audio': 'Audio track', 'Cargar subtítulos': 'Load subtitles', 'Cargar subtítulos...': 'Load subtitles...',
    'Desactivados': 'Off', 'Desactivado': 'Off', 'Activado': 'On', 'Apagada': 'Off', 'Apagado': 'Off', 'Normal': 'Normal',
    'Color y efectos': 'Color & effects', 'Color y efectos (C)': 'Color & effects (C)', 'Captura': 'Screenshot', 'Captura (Ctrl+S)': 'Screenshot (Ctrl+S)', 'Guardar captura': 'Save screenshot',
    'Lista de capítulos': 'Episode list', 'Lista de capítulos (L)': 'Episode list (L)', 'Ocultar lista': 'Hide list', 'Ocultar lista (L)': 'Hide list (L)', 'Mostrar lista': 'Show list',
    'Modo cine': 'Cinema mode', 'Modo cine (T)': 'Cinema mode (T)', 'Salir del modo cine (T)': 'Exit cinema mode (T)', 'Mini reproductor (I)': 'Mini player (I)', 'Mini': 'Mini',
    'Pantalla completa': 'Fullscreen', 'Pantalla completa (F)': 'Fullscreen (F)', 'Luz ambiental': 'Ambient light', 'Luz ambiental (G)': 'Ambient light (G)',
    'Luz ambiental alrededor del video': 'Ambient light around the video', 'Luz ambiental alrededor del video (G)': 'Ambient light around the video (G)', 'Volver al reproductor': 'Back to the player',
    'Siempre visible': 'Always on top', 'Expandir': 'Expand', 'Fijar': 'Pin', 'Cuadro a cuadro': 'Frame by frame', 'Cuadro a cuadro no disponible en modo compatible': 'Frame by frame not available in compatibility mode',
    'No hay más capítulos': 'No more episodes', 'Saltar opening': 'Skip opening', 'Saltar ending': 'Skip ending', 'Saltar': 'Skip',
    'El opening empieza aquí': 'The opening starts here', 'El opening termina aquí': 'The opening ends here', 'El ending empieza aquí': 'The ending starts here', 'El ending termina aquí': 'The ending ends here',
    'Borrar marcas de opening/ending': 'Clear opening/ending marks', 'Inicio del opening marcado': 'Opening start marked', 'Fin del opening marcado': 'Opening end marked',
    'Inicio del ending marcado': 'Ending start marked', 'Fin del ending marcado': 'Ending end marked', 'Usar este cuadro como portada': 'Use this frame as cover',
    'Diagnóstico': 'Diagnostics', 'Diagnóstico de reproducción (Shift+D)': 'Playback diagnostics (Shift+D)', 'Ocultar diagnóstico': 'Hide diagnostics', 'Modo': 'Mode', 'Directo': 'Direct',
    'Compatible (FFmpeg)': 'Compatibility (FFmpeg)', 'Conversión': 'Conversion', 'Video': 'Video', 'Audio': 'Audio', 'Contenedor': 'Container', 'Búfer adelante': 'Buffer ahead',
    'Cuadros perdidos': 'Dropped frames', 'Último salto': 'Last seek', 'Color GPU': 'GPU color', 'Archivo': 'File', 'WebGL + mejora': 'WebGL + enhancement',
    'Este video no tiene subtítulos (usa el menú para cargar uno)': 'This video has no subtitles (use the menu to load one)',
    'El archivo de subtítulos no tiene líneas reconocibles': 'The subtitle file has no recognizable lines', 'No se pudieron leer los subtítulos': 'Couldn\'t read the subtitles',
    'No se pudo extraer el subtítulo': 'Couldn\'t extract the subtitle', 'No se pudo leer el subtítulo incrustado': 'Couldn\'t read the embedded subtitle',
    'Para subtítulos externos usa el menú de subtítulos del reproductor': 'For external subtitles use the player\'s subtitle menu',
    'No se puede reproducir este archivo': 'This file can\'t be played', 'El archivo está dañado o usa un códec no compatible.': 'The file is damaged or uses an unsupported codec.',
    'Error de lectura del archivo.': 'File read error.', 'Formato o códec no compatible con el reproductor integrado.': 'Format or codec not supported by the built-in player.',
    'No se pudo analizar el archivo': 'Couldn\'t analyze the file', 'Captura guardada en Imágenes\\Kuro Player': 'Screenshot saved in Pictures\\Kuro Player',
    'No hay reproductores externos activos. Configúralos en Ajustes → Programas externos.': 'No external players enabled. Set them up in Settings → External programs.',
    'No se pudo abrir ese programa (¿se desinstaló?)': 'Couldn\'t open that program (was it uninstalled?)', 'Vía PotPlayer': 'Via PotPlayer',
    'estéreo': 'stereo', 'no disponible': 'not available', 'Automática': 'Automatic',
    // panel de color
    'Imagen': 'Image', 'Color': 'Color', 'Efectos': 'Effects', 'Brillo': 'Brightness', 'Contraste': 'Contrast', 'Gamma': 'Gamma', 'Saturación': 'Saturation',
    'Intensidad (vibrance)': 'Vibrance', 'Tono': 'Hue', 'Temperatura': 'Temperature', 'Matiz verde/magenta': 'Green/magenta tint', 'Nitidez / Suavizado': 'Sharpen / Soften', 'Viñeta': 'Vignette',
    'Anime vívido': 'Vivid anime', 'Anime suave': 'Soft anime', 'Colores intensos': 'Intense colors', 'Cine': 'Cinema', 'Nítido': 'Sharp', 'Brillante': 'Bright', 'Noche (cálido)': 'Night (warm)',
    'Blanco y negro': 'Black & white', 'Comparar antes/después': 'Compare before/after', 'Guardar solo para esta serie': 'Save only for this series', 'Restablecer': 'Reset',
    'Global': 'Global', 'Global (todas las series)': 'Global (all series)', 'Solo esta serie': 'This series only', 'Original': 'Original', 'Ajustado': 'Adjusted',
    'Doble clic para restablecer': 'Double-click to reset', 'Ajustes de color globales': 'Global color settings', 'La comparación requiere aceleración por GPU': 'Comparison requires GPU acceleration',
    'Mejora de imagen (anime)': 'Image enhancement (anime)', 'Mejora de imagen': 'Image enhancement', 'Suave': 'Soft', 'Media': 'Medium', 'Fuerte': 'Strong',
    'La mejora de imagen requiere aceleración por GPU': 'Image enhancement requires GPU acceleration',
    'Desactiva el modo rendimiento para usar la mejora de imagen': 'Turn off performance mode to use image enhancement',
    // grupos
    'Anime': 'Anime', 'Otro': 'Other', 'Otros': 'Other', 'Grupo': 'Group', 'Grupos': 'Groups', 'Nuevo grupo': 'New group', 'Editar grupo': 'Edit group', 'Eliminar grupo': 'Delete group',
    'Nombre': 'Name', 'Ícono': 'Icon', 'Tipo de contenido': 'Content type', 'Series de TV y dramas': 'TV series and dramas', 'Series y películas de anime': 'Anime series and movies',
    'Cada video suelto es una película': 'Each loose video is a movie', 'Editar grupo (nombre, ícono, tipo)...': 'Edit group (name, icon, type)...', 'Agregar carpeta a este grupo...': 'Add folder to this group...',
    'Subir en el menú': 'Move up in the menu', 'Bajar en el menú': 'Move down in the menu', 'Cargar datos de internet de este grupo': 'Load online data for this group',
    'Debe quedar al menos un grupo': 'At least one group must remain', 'Crear grupo': 'Create group', 'Sin búsqueda en internet': 'No online search', 'sin búsqueda en internet': 'no online search',
    'busca datos en internet': 'searches online data', 'Mover a otro grupo': 'Move to another group', 'Mover a': 'Move to',
    'Los grupos separan tu biblioteca (por ejemplo Anime, Películas, Series). Cada uno aparece en el menú de la izquierda con sus propias carpetas.': 'Groups split your library (for example Anime, Movies, Series). Each one appears in the left menu with its own folders.',
    'Cada grupo tiene sus propias carpetas y aparece en el menú de la izquierda; lo de un grupo no se mezcla con otro. Los archivos nunca se modifican ni se borran: «Quitar» solo deja de mostrarlos en la app.': 'Each group has its own folders and appears in the left menu; one group\'s content never mixes with another\'s. Files are never modified or deleted: «Remove» only stops showing them in the app.',
    'Agrega la carpeta donde guardas tus animes. Cada subcarpeta se convertirá en una tarjeta de la cartelera y sus videos en capítulos.': 'Add the folder where you keep your anime. Each subfolder becomes a card in the library and its videos become episodes.',
    'Agrega la carpeta donde guardas tus películas. Cada video suelto (o cada subcarpeta) se convierte en una película de la cartelera.': 'Add the folder where you keep your movies. Each loose video (or each subfolder) becomes a movie in the library.',
    // perfiles
    'Perfiles': 'Profiles', 'Agregar perfil': 'Add profile', 'Cambiar de perfil': 'Switch profile', 'Administrar perfiles...': 'Manage profiles...', 'Administrar perfiles': 'Manage profiles',
    'Cada perfil tiene su propio progreso, capítulos vistos y «Continuar viendo». La biblioteca, los grupos y los ajustes son compartidos.': 'Each profile has its own progress, watched episodes and «Continue watching». The library, groups and settings are shared.',
    'Se borra su progreso y sus capítulos vistos. Los demás perfiles no cambian.': 'Its progress and watched episodes are deleted. Other profiles don\'t change.',
    // ajustes: pestañas
    'Biblioteca': 'Library', 'Apariencia': 'Appearance', 'Reproducción': 'Playback', 'Datos de internet': 'Online data', 'Programas externos': 'External programs', 'Acerca de': 'About',
    'Ajustes por secciones': 'Settings by section', 'Atajos': 'Shortcuts', 'Avanzado': 'Advanced',
    // ajustes: biblioteca
    'Carpetas de la cartelera': 'Library folders', 'Qué carpetas lee la cartelera. Cada subcarpeta es una serie y sus videos, los capítulos.': 'Which folders the library reads. Each subfolder is a series and its videos are the episodes.',
    'Quitar todas las carpetas': 'Remove all folders', 'La carpeta no existe o el disco no está conectado': 'The folder doesn\'t exist or the drive isn\'t connected',
    'Carpeta quitada de la cartelera': 'Folder removed from the library', 'Sin cambios en esa carpeta': 'No changes in that folder', 'Agregar una carpeta que ya está cargada': 'Add a folder that\'s already loaded',
    'Detectar cambios automáticamente': 'Detect changes automatically', 'Al copiar capítulos o carpetas nuevas se agregan solos a los pocos segundos, sin volver a cargar lo que ya existe.': 'New episodes or folders you copy are added on their own within seconds, without reloading what\'s already there.',
    'Temporadas en subcarpetas': 'Seasons in subfolders', 'Separar temporadas por defecto': 'Split seasons by default',
    'Si la carpeta de una serie tiene subcarpetas (ej. «Nombre 1», «Nombre 2»), cada una aparece como una tarjeta propia. Si está apagado se agrupan en una sola serie con pestañas.': 'If a series folder has subfolders (e.g. «Name 1», «Name 2»), each one appears as its own card. When off they are grouped into a single series with tabs.',
    'Se puede cambiar serie por serie': 'Can be changed series by series', 'Temporadas separadas: cada subcarpeta es ahora una serie': 'Seasons split: each subfolder is now a series',
    'Temporadas unidas en una sola serie': 'Seasons merged into a single series', 'Miniaturas de capítulos': 'Episode thumbnails', 'Generar miniaturas automáticamente': 'Generate thumbnails automatically',
    'Se crea una imagen de cada capítulo al navegar.': 'An image of each episode is created as you browse.', 'Borra las miniaturas guardadas para crearlas de nuevo.': 'Deletes saved thumbnails so they are created again.',
    'Borrar miniaturas': 'Clear thumbnails', 'Miniaturas borradas; se regenerarán al navegar': 'Thumbnails cleared; they\'ll be regenerated as you browse',
    'Progreso': 'Progress', 'Borrar todo el progreso': 'Clear all progress', 'Olvida posiciones guardadas y capítulos vistos de toda la biblioteca.': 'Forgets saved positions and watched episodes for the whole library.',
    'Se borró todo el progreso': 'All progress was cleared', 'Vacía la fila del Inicio. No borra tu progreso ni los capítulos vistos; las series vuelven a aparecer cuando sigas viéndolas.': 'Empties the Home row. It doesn\'t delete your progress or watched episodes; series come back when you keep watching them.',
    'Se borra el punto donde te quedaste y las marcas de «visto» de todos los capítulos.': 'The point where you stopped and the «watched» marks of all episodes are deleted.',
    'Restablecer Kuro Player: deja la app como recién instalada': 'Reset Kuro Player: leave the app as freshly installed', 'Sí, restablecer todo': 'Yes, reset everything',
    'Deja la aplicación como recién instalada: borra la lista de carpetas, el progreso y «Continuar viendo», los datos de internet, portadas y fondos elegidos, categorías, ajustes, miniaturas y caché.': 'Leaves the app as freshly installed: clears the folder list, progress and «Continue watching», online data, chosen covers and backgrounds, categories, settings, thumbnails and cache.',
    'Tus videos no se borran': 'Your videos are not deleted', 'Tus videos no se tocan.': 'Your videos are not touched.', '(tus archivos no se tocaron)': '(your files were not touched)',
    'Copia de seguridad': 'Backup', 'Exportar copia...': 'Export backup...', 'Restaurar copia...': 'Restore backup...', 'Guardar copia de seguridad': 'Save backup', 'Restaurar copia de seguridad': 'Restore backup',
    'Guarda en un archivo tus grupos, carpetas, progreso de todos los perfiles, datos de internet, categorías, ajustes y portadas. Útil para cambiar de PC o reinstalar.': 'Saves your groups, folders, progress of all profiles, online data, categories, settings and covers to a file. Useful when changing PCs or reinstalling.',
    'El archivo no es una copia de Kuro Player': 'The file is not a Kuro Player backup', 'Copia de Kuro Player': 'Kuro Player backup',
    'Abrir carpeta de datos': 'Open data folder', 'Categorías propias': 'Custom categories', 'Aún no has creado categorías.': 'You haven\'t created any categories yet.',
    'Se cambia en todas las series que la tienen.': 'It changes in every series that has it.',
    'Se crean desde «Editar» en una serie, o en la Cartelera con el botón «Seleccionar» para varias series a la vez. Aparecen con ★ en el filtro de géneros.': 'Create them from «Edit» on a series, or in the Library with the «Select» button for several series at once. They appear with ★ in the genre filter.',
    // ajustes: apariencia
    'Tema': 'Theme', 'Oscuro': 'Dark', 'Negro OLED': 'OLED black', 'Claro': 'Light', 'Automático': 'Automatic', '«Automático» sigue el modo claro u oscuro de Windows.': '«Automatic» follows Windows light or dark mode.',
    'Color de acento': 'Accent color', 'Personalizado': 'Custom', 'Color según la portada': 'Color from the cover', 'Al abrir una serie o reproducir, el color de acento toma el tono de su portada.': 'When opening or playing a series, the accent color takes the tone of its cover.',
    'Transparencia de los paneles': 'Panel transparency', 'Más bajo = paneles más transparentes; más alto = más sólidos.': 'Lower = more transparent panels; higher = more solid.',
    'Desenfoque del cristal': 'Glass blur', '0 = sin efecto de vidrio.': '0 = no glass effect.', 'Fondo animado': 'Animated background', 'Manchas de color que se mueven lentamente detrás de la interfaz.': 'Color blobs that move slowly behind the interface.',
    'Imagen de fondo propia': 'Custom background image', 'Una imagen tuya detrás de toda la app (se ve a través del cristal).': 'An image of yours behind the whole app (seen through the glass).',
    'Elegir imagen...': 'Choose image...', 'Elegir imagen de fondo': 'Choose background image', 'Elegir imagen de fondo...': 'Choose background image...', 'Opacidad del fondo': 'Background opacity',
    'Tamaño de la interfaz': 'Interface size', 'Menú lateral de grupos': 'Group side menu', 'La barra de la izquierda con tus grupos (Anime, Películas...).': 'The left bar with your groups (Anime, Movies...).',
    'Modo rendimiento': 'Performance mode', 'Para PCs más lentas: quita el cristal, las animaciones y la luz ambiental.': 'For slower PCs: removes glass, animations and ambient light.',
    'Secciones del Inicio': 'Home sections', 'Activa o desactiva lo que se muestra en la pantalla de Inicio.': 'Turn on or off what shows on the Home screen.',
    'Vista por defecto': 'Default view', 'Tipo de vista': 'View type', 'También se cambia con los botones de la cartelera.': 'Can also be changed with the library buttons.',
    'Tamaño de tarjetas': 'Card size', 'Pequeñas': 'Small', 'Medianas': 'Medium', 'Grandes': 'Large', 'Idioma': 'Language', 'Idioma de la interfaz': 'Interface language',
    'Brillo de colores del video detrás del reproductor.': 'Glow of the video colors behind the player.', 'Título mostrado': 'Displayed title',
    'Nombre de la carpeta': 'Folder name', 'Título oficial (romaji)': 'Official title (romaji)', 'Título en inglés': 'English title', 'Título japonés': 'Japanese title',
    'Tus títulos editados a mano siempre tienen prioridad.': 'Titles you edit by hand always take priority.',
    // ajustes: reproducción
    'Opening y ending': 'Opening and ending', 'Mostrar botón «Saltar»': 'Show «Skip» button', 'Saltar automáticamente': 'Skip automatically',
    'Usa las marcas de AniSkip (gratis, para anime vinculado a internet) o las que pongas tú con clic derecho sobre el video → «El opening empieza aquí».': 'Uses AniSkip marks (free, for anime linked online) or your own via right-click on the video → «The opening starts here».',
    'Buscar marcas en AniSkip': 'Look up marks on AniSkip', 'Descarga desde internet dónde empiezan y terminan el opening y el ending de cada capítulo.': 'Downloads where the opening and ending of each episode start and end.',
    'Precargar el siguiente capítulo': 'Preload the next episode', 'En el último minuto se deja listo el siguiente para que empiece sin espera.': 'During the last minute the next one is prepared so it starts without waiting.',
    'Preguntar si continuar o empezar de cero': 'Ask whether to continue or start over',
    'Al abrir un capítulo a medias aparece un aviso con «Continuar» y «Desde el inicio». Si no eliges nada en 5 segundos, continúa donde lo dejaste. Apagado: continúa directamente.': 'When opening a half-watched episode a prompt shows «Continue» and «From the start». If you don\'t choose within 5 seconds, it continues where you left off. Off: continues directly.',
    'Reproducir el siguiente automáticamente': 'Play the next one automatically', 'Al terminar un capítulo se muestra una cuenta atrás.': 'A countdown shows when an episode ends.',
    'Cuenta atrás': 'Countdown', 'Segundos antes de pasar al siguiente': 'Seconds before moving to the next one', 'seg': 'sec', 'Saltos': 'Seeking', 'Salto con ← →': 'Seek with ← →', 'Salto con Shift + ← →': 'Seek with Shift + ← →',
    'Volumen con ↑ ↓ y rueda': 'Volume with ↑ ↓ and wheel', 'Cuánto sube o baja cada vez': 'How much it goes up or down each time', 'Saltos con el teclado, volumen y capítulo siguiente.': 'Keyboard seeking, volume and next episode.',
    'Escalado y líneas nítidas para anime': 'Upscaling and sharp lines for anime',
    'Escala el video a la resolución de tu pantalla en la tarjeta gráfica y afina las líneas del dibujo (inspirado en Anime4K). Útil en capítulos de 480p o 720p. También desde el panel de color o con Shift+E. No se usa en modo rendimiento.': 'Scales the video to your screen resolution on the graphics card and refines the line art (inspired by Anime4K). Useful for 480p or 720p episodes. Also from the color panel or with Shift+E. Not used in performance mode.',
    'Aceleración de video': 'Video acceleration', 'Luz ambiental alrededor del video': 'Ambient light around the video',
    // ajustes: subtítulos
    'Subtítulos externos': 'External subtitles', 'Cargar automáticamente': 'Load automatically', 'Si junto al video hay un .srt/.ass/.vtt con el mismo nombre.': 'If next to the video there\'s an .srt/.ass/.vtt with the same name.',
    'Tamaño y altura': 'Size and height', 'Estilo': 'Style', 'Fondo': 'Background', 'Contorno': 'Outline', 'Sombra': 'Shadow', 'Altura': 'Height', 'Fuente de letra': 'Font', 'Vista previa': 'Preview',
    'También se ajustan desde el botón de subtítulos del reproductor (tecla S alterna pistas).': 'They can also be adjusted from the player\'s subtitle button (S key cycles tracks).',
    // ajustes: datos de internet
    'Verifica los nombres contra AniList / MyAnimeList y trae descripción, géneros, estudio, año, puntuación y portada.': 'Checks names against AniList / MyAnimeList and fetches description, genres, studio, year, score and cover.',
    'Cargar datos de la biblioteca': 'Load library data', 'Borrar datos de internet': 'Clear online data', 'Datos de internet borrados': 'Online data cleared', 'Datos de internet guardados': 'Online data saved', 'Datos de internet quitados': 'Online data removed',
    'Quita descripciones, géneros y portadas descargadas (no toca tus archivos).': 'Removes downloaded descriptions, genres and covers (doesn\'t touch your files).',
    'Traducir descripciones al español': 'Translate descriptions to Spanish', 'Las fuentes están en inglés; se traducen automáticamente al guardar.': 'Sources are in English; they are translated automatically when saved.',
    'Usar también la portada de internet': 'Also use the online cover', 'Solo para series que no tienen portada propia en su carpeta.': 'Only for series without their own cover in their folder.',
    'Carpetas con nombre distinto al oficial': 'Folders named differently from the official title', 'Nombres de carpeta que no coinciden exactamente con un título oficial.': 'Folder names that don\'t exactly match an official title.',
    'Todo está vinculado': 'Everything is linked', 'Sin coincidencia con este nombre': 'No match for this name', 'No hay nada pendiente de revisar.': 'Nothing pending review.',
    'Todas las carpetas vinculadas ya tienen su nombre oficial.': 'All linked folders already have their official name.', 'Buscar manualmente': 'Search manually', 'por confirmar': 'to confirm', 'sin coincidencia': 'no match', 'sin buscar': 'not searched',
    'Sin resultados. Prueba con el nombre en romaji o en inglés.': 'No results. Try the name in romaji or English.', 'No se encontró en internet con este nombre.': 'Not found online with this name.',
    'Sin conexión a internet': 'No internet connection', 'Sin conexión a internet: no se pudo completar': 'No internet connection: couldn\'t complete', 'No se pudo completar la búsqueda': 'Couldn\'t complete the search',
    'El servicio está ocupado, inténtalo más tarde': 'The service is busy, try again later', 'Ya se están descargando datos': 'Data is already being downloaded',
    'Enlace no reconocido. Usa uno de AniList, MyAnimeList, Kitsu, TVmaze o Wikipedia.': 'Link not recognized. Use one from AniList, MyAnimeList, Kitsu, TVmaze or Wikipedia.',
    'Pegar enlace': 'Paste link', 'Vincular': 'Link', 'Se conservará tu nombre de carpeta': 'Your folder name will be kept', 'Se volverá a sugerir el nombre oficial': 'The official name will be suggested again',
    'Avisa cuando el nombre de una carpeta no coincide con el título oficial. Desactívalo para conservar siempre tus nombres.': 'Warns when a folder name doesn\'t match the official title. Turn it off to always keep your names.',
    'Nombres incompletos, mal escritos, con guiones bajos o palabras pegadas. Puedes renombrarlas con el título correcto; los prefijos de orden como «1_» o «M_» se conservan.': 'Incomplete or misspelled names, with underscores or joined words. You can rename them to the correct title; order prefixes like «1_» or «M_» are kept.',
    'Sí, usar': 'Yes, use', 'No es': 'It isn\'t', 'Renombrar': 'Rename', 'Renombrar todas': 'Rename all', 'Conservar': 'Keep',
    // ajustes: programas externos
    'Reproductores instalados para la opción «Abrir con» del clic derecho.': 'Installed players for the right-click «Open with» option.', 'Identificar reproductores': 'Identify players',
    'Sí, identificar': 'Yes, identify', 'Agregar otro programa...': 'Add another program...', 'Elegir un reproductor de video': 'Choose a video player', 'No se encontraron reproductores conocidos': 'No known players found',
    'Aún no hay reproductores. Pulsa «Identificar reproductores».': 'No players yet. Press «Identify players».', '¿Seguro que quieres buscar reproductores de video instalados en este equipo?': 'Are you sure you want to look for video players installed on this computer?',
    'Activa los que quieras ver en «Abrir con». Si el programa lo permite (PotPlayer, VLC, MPC, mpv) continúa en el mismo segundo.': 'Enable the ones you want in «Open with». If the program supports it (PotPlayer, VLC, MPC, mpv) it continues at the same second.',
    'continúa en el mismo segundo': 'continues at the same second', 'abre desde el inicio': 'opens from the start', 'Reproductor de Windows Media': 'Windows Media Player',
    // ajustes: acerca de
    'Versión': 'Version', 'Historial de versiones': 'Version history', 'actual': 'current', 'Créditos': 'Credits', 'Página del proyecto': 'Project page', 'Ver en GitHub': 'View on GitHub',
    'Buscar actualizaciones': 'Check for updates', 'Avisar cuando haya una versión nueva': 'Notify when there\'s a new version', 'Al abrir la app se revisa GitHub; nunca se instala nada sin que lo confirmes.': 'GitHub is checked when the app opens; nothing is ever installed without your confirmation.',
    'Nueva versión': 'New version', 'Ver novedades': 'See what\'s new', 'Descargar e instalar': 'Download and install', 'Omitir esta versión': 'Skip this version', 'Más tarde': 'Later', 'Instalar ahora': 'Install now',
    'Descargando...': 'Downloading...', 'Descarga no permitida': 'Download not allowed', 'Tienes la última versión': 'You have the latest version',
    'Información técnica': 'Technical information', 'Motor de conversión': 'Conversion engine', 'Procesado de color': 'Color processing', 'Contenedores de video': 'Video containers', 'Códecs de video': 'Video codecs', 'Códecs de audio': 'Audio codecs',
    'Hecho para uso personal. Todos tus datos se guardan solo en este equipo.': 'Made for personal use. All your data is stored only on this computer.',
    'Videoteca local para tu anime, películas y series: cartelera con portadas, reproductor moderno con efectos de cristal, color por GPU y compatibilidad universal de formatos.': 'Local video library for your anime, movies and series: poster library, modern player with glass effects, GPU color and universal format support.',
    'Versión, formatos compatibles y datos de la aplicación.': 'Version, supported formats and app data.',
    '— base de la aplicación': '— app foundation', '— series y películas ·': '— series and movies ·', '— marcas de opening y ending ·': '— opening and ending marks ·', '— idea de la mejora de imagen': '— image enhancement idea', '— traducción de descripciones ·': '— description translation ·', 'y': 'and', '— traducción de descripciones': '— description translation',
    // géneros
    'Acción': 'Action', 'Aventura': 'Adventure', 'Comedia': 'Comedy', 'Drama': 'Drama', 'Ecchi': 'Ecchi', 'Fantasía': 'Fantasy', 'Terror': 'Horror', 'Mecha': 'Mecha', 'Música': 'Music',
    'Misterio': 'Mystery', 'Psicológico': 'Psychological', 'Romance': 'Romance', 'Ciencia ficción': 'Sci-Fi', 'Recuentos de la vida': 'Slice of Life', 'Deportes': 'Sports',
    'Sobrenatural': 'Supernatural', 'Suspenso': 'Thriller', 'Chicas mágicas': 'Mahou Shoujo', 'Hentai': 'Hentai', 'Histórico': 'Historical', 'Militar': 'Military', 'Escolar': 'School',
    'Isekai': 'Isekai', 'Reencarnación': 'Reincarnation', 'Magia': 'Magic', 'Demonios': 'Demons', 'Vampiros': 'Vampire', 'Samuráis': 'Samurai', 'Mitología': 'Mythology', 'Viajes en el tiempo': 'Time Travel',
    'Fantasía urbana': 'Urban Fantasy', 'Deportes de combate': 'Combat Sports', 'Deportes en equipo': 'Team Sports', 'Gastronomía': 'Gourmet', 'Médico': 'Medical', 'Artes escénicas': 'Performing Arts',
    'Antropomórfico': 'Anthropomorphic', 'Cambio de sexo': 'Gender Bending', 'Erótico': 'Erotica', 'Farándula': 'Showbiz', 'Juegos de alto riesgo': 'High Stakes Game', 'Subtexto romántico': 'Romantic Subtext',
    'Triángulo amoroso': 'Love Triangle', 'Animación': 'Animation', 'Documental': 'Documentary', 'Familia': 'Family', 'Crimen': 'Crime', 'Guerra': 'War', 'Western': 'Western',
    'Alemán': 'German', 'Español': 'Spanish', 'Francés': 'French', 'Inglés': 'English', 'Japonés': 'Japanese', 'Portugués': 'Portuguese', 'Italiano': 'Italian', 'Chino': 'Chinese', 'Coreano': 'Korean', 'Ruso': 'Russian',
    // diálogos del sistema y avisos varios
    'Error al escanear la biblioteca': 'Error scanning the library', 'No se pudo guardar la biblioteca': 'Couldn\'t save the library', 'No se pudieron migrar los datos anteriores': 'Couldn\'t migrate previous data',
    'Imágenes': 'Images', 'Espacio': 'Space', 'Ctrl': 'Ctrl', 'Shift': 'Shift',
  };

  // patrones con partes variables (números, nombres)
  const PAT = [
    [/^(\d+) capítulos?$/, (m, n) => `${n} episode${n === '1' ? '' : 's'}`],
    [/^(\d+) películas?$/, (m, n) => `${n} movie${n === '1' ? '' : 's'}`],
    [/^(\d+) títulos?$/, (m, n) => `${n} title${n === '1' ? '' : 's'}`],
    [/^(\d+) series$/, (m, n) => `${n} series`],
    [/^(\d+) vistos?$/, (m, n) => `${n} watched`],
    [/^(\d+) de (\d+)$/, (m, a, b) => `${a} of ${b}`],
    [/^Capítulo (\d+) de (\d+) · (\d+) vistos?$/, (m, a, b, c) => `Episode ${a} of ${b} · ${c} watched`],
    [/^Capítulo (.+)$/, (m, a) => `Episode ${a}`],
    [/^Episodio (.+)$/, (m, a) => `Episode ${a}`],
    [/^Temporada (.+)$/, (m, a) => `Season ${a}`],
    [/^Hace (\d+) min$/, (m, n) => `${n} min ago`],
    [/^Hace (\d+) h$/, (m, n) => `${n} h ago`],
    [/^Hace (\d+) días?$/, (m, n) => `${n} day${n === '1' ? '' : 's'} ago`],
    [/^Ayer$/, () => 'Yesterday'], [/^Hoy$/, () => 'Today'], [/^Ahora$/, () => 'Now'],
    [/^Quedan (.+)$/, (m, a) => `${a} left`],
    [/^Siguiente en (\d+)$/, (m, n) => `Next in ${n}`],
    [/^Mejora de imagen: (.+)$/, (m, a) => `Image enhancement: ${tr(a) || a}`],
    [/^Velocidad: (.+)$/, (m, a) => `Speed: ${a}`],
    [/^Volumen: (.+)$/, (m, a) => `Volume: ${a}`],
    [/^Subtítulos: (.+)$/, (m, a) => `Subtitles: ${a}`],
    [/^Audio: (.+)$/, (m, a) => `Audio: ${a}`],
    [/^Ver todos \((\d+)\)$/, (m, n) => `See all (${n})`],
    [/^Tienes la última versión \((.+)\)$/, (m, v) => `You have the latest version (${v})`],
    [/^Buscar en (.+)\.\.\.$/, (m, a) => `Search in ${a}...`],
    [/^Buscar «(.+)» en internet$/, (m, a) => `Search «${a}» online`],
    [/^Agregar carpetas? a «(.+)»$/, (m, a) => `Add folder to «${a}»`],
    [/^Agregar carpeta a «(.+)»\.\.\.$/, (m, a) => `Add folder to «${a}»...`],
    [/^Carpeta agregada a «(.+)»$/, (m, a) => `Folder added to «${a}»`],
    [/^Carpeta movida a «(.+)»$/, (m, a) => `Folder moved to «${a}»`],
    [/^Carpeta renombrada a «(.+)»$/, (m, a) => `Folder renamed to «${a}»`],
    [/^Categoría renombrada a «(.+)»$/, (m, a) => `Category renamed to «${a}»`],
    [/^Mover a «(.+)»$/, (m, a) => `Move to «${a}»`],
    [/^Vinculado a «(.+)»(.*)$/, (m, a, b) => `Linked to «${a}»${b}`],
    [/^Eliminar el grupo «(.+)»\?$/, (m, a) => `Delete the group «${a}»?`],
    [/^¿Eliminar el grupo «(.+)»\?$/, (m, a) => `Delete the group «${a}»?`],
    [/^¿Eliminar el perfil «(.+)»\?$/, (m, a) => `Delete the profile «${a}»?`],
    [/^Grupo «(.+)» eliminado$/, (m, a) => `Group «${a}» deleted`],
    [/^Unir temporadas de «(.+)»$/, (m, a) => `Merge seasons of «${a}»`],
    [/^Ver todas las series de «(.+)»$/, (m, a) => `See all series in «${a}»`],
    [/^Estos ajustes de color se usarán solo en «(.+)»$/, (m, a) => `These color settings will be used only for «${a}»`],
    [/^Listo: se aplicará en todos los capítulos de «(.+)»$/, (m, a) => `Done: it will apply to every episode of «${a}»`],
    [/^Perfil: (.+)$/, (m, a) => `Profile: ${a}`],
    [/^Oficial: (.+)$/, (m, a) => `Official: ${a}`],
    [/^Error al descargar: (.+)$/, (m, a) => `Download error: ${a}`],
    [/^No se pudo renombrar: (.+)$/, (m, a) => `Couldn't rename: ${a}`],
    [/^No se pudo revisar: (.+)$/, (m, a) => `Couldn't check: ${a}`],
    [/^No se pudo convertir el archivo: (.+)$/, (m, a) => `Couldn't convert the file: ${a}`],
    [/^Kuro Player (\S+) disponible$/, (m, v) => `Kuro Player ${v} available`],
    [/^(\d+) capítulos nuevos en (.+)$/, (m, n, a) => `${n} new episodes in ${a}`],
    [/^(\d+) títulos nuevos$/, (m, n) => `${n} new titles`],
    [/^(\d+) seleccionadas?$/, (m, n) => `${n} selected`],
    [/^(\d+) carpetas?$/, (m, n) => `${n} folder${n === '1' ? '' : 's'}`],
    [/^(\d+) en disco$/, (m, n) => `${n} on disk`],
  ];

  // segunda tanda (textos encontrados recorriendo todas las pantallas)
  Object.assign(EN, {
    'Tip: pon una imagen llamada': 'Tip: put an image named', 'dentro de cada carpeta para usarla como portada (también': 'inside each folder to use it as the cover (also',
    'para el banner). También puedes elegirla desde la app o arrastrar carpetas aquí.': 'for the banner). You can also choose it from the app or drag folders here.',
    'Crear un grupo nuevo (películas, series, etc.)': 'Create a new group (movies, series, etc.)', 'Quitar de «Continuar viendo»': 'Remove from «Continue watching»',
    'Todo': 'All', 'Capítulos vistos': 'Episodes watched', 'Serie TV': 'TV series', 'Serie TV ·': 'TV series ·', 'Especial': 'Special', 'Película ·': 'Movie ·',
    'Borrar progreso': 'Clear progress', 'Cambiar portada': 'Change cover', 'Portada': 'Cover', 'Internet': 'Online', 'Visto': 'Watched', 'Cargar archivo...': 'Load file...', 'Retraso': 'Delay',
    'Biblioteca y carpetas': 'Library & folders', 'Grupos y carpetas': 'Groups & folders', 'Actualizar todas': 'Refresh all', 'Actualizar': 'Refresh',
    'Buscar series y capítulos nuevos en esta carpeta': 'Look for new series and episodes in this folder', 'Abrir en el explorador': 'Open in Explorer',
    'En la página de la serie o con clic derecho: «Separar temporadas» / «Unir temporadas».': 'On the series page or with right-click: «Split seasons» / «Merge seasons».',
    'Novedades': 'What\'s new', 'No se duplica: solo se buscan las series y capítulos nuevos. Lo nuevo se marca como «NUEVO» durante 7 días.': 'Nothing is duplicated: only new series and episodes are looked up. New items are tagged «NEW» for 7 days.',
    'Cómo se detectan portadas y fondos': 'How covers and backgrounds are detected', 'Portada: imagen llamada': 'Cover: image named',
    '(.jpg/.png/.webp) dentro de la carpeta de la serie; si no hay, la primera imagen que encuentre; si no, la de internet o un cuadro del capítulo 1. Fondo/banner:': '(.jpg/.png/.webp) inside the series folder; if there is none, the first image found; otherwise the online one or a frame from episode 1. Background/banner:',
    '. Subcarpetas como «Temporada 1» se agrupan dentro de la misma serie.': '. Subfolders like «Season 1» are grouped into the same series.',
    'Restablecer Kuro Player': 'Reset Kuro Player', 'Restablecer todo': 'Reset everything', 'Cartelera, miniaturas y luz ambiental.': 'Library, thumbnails and ambient light.',
    'Violeta': 'Violet', 'Rosa': 'Pink', 'Azul': 'Blue', 'Cian': 'Cyan', 'Verde': 'Green', 'Naranja': 'Orange', 'Rojo': 'Red', 'Dorado': 'Gold', 'Índigo': 'Indigo', 'Gris': 'Gray', 'Ámbar': 'Amber', 'Menta': 'Mint',
    'Elegir otro color': 'Choose another color', 'Efecto cristal y fondo': 'Glass effect & background', 'Elegir imagen': 'Choose image', 'Interfaz': 'Interface',
    'La app se recarga al cambiarlo. En inglés las descripciones se muestran en su idioma original.': 'The app reloads when changed. In English, descriptions are shown in their original language.',
    'Agranda o achica textos y botones.': 'Makes text and buttons larger or smaller.', 'Intensidad de la imagen': 'Image intensity',
    '5 capítulos al azar (cambian cada día) y el botón «Elegir uno al azar».': '5 random episodes (they change every day) and the «Pick one at random» button.',
    'Regenerar miniaturas': 'Regenerate thumbnails', 'Regenerar': 'Regenerate', 'Teclado': 'Keyboard', 'Adelantar / retroceder': 'Forward / back', 'Salto largo': 'Long seek',
    'Inicio e historial': 'Home & history', 'Limpiar': 'Clear', 'Archivos .srt / .ass / .vtt con el mismo nombre del video.': '.srt / .ass / .vtt files with the same name as the video.',
    'Nota: los subtítulos incrustados dentro de archivos MKV no se pueden leer en el reproductor integrado; usa «Abrir en PotPlayer» para esos.': 'Note: subtitles embedded in MKV files can\'t be read by the built-in player; use «Open in PotPlayer» for those.',
    'Busca cada serie por el nombre de su carpeta. Si el nombre coincide con un anime real se guarda automáticamente; si hay dudas queda «por confirmar» para que elijas tú. Requiere internet (~2 s por serie).': 'Looks up each series by its folder name. If the name matches a real title it\'s saved automatically; if in doubt it stays «to confirm» so you can choose. Requires internet (~2 s per series).',
    'Detener': 'Stop', 'Revisar coincidencias dudosas': 'Review uncertain matches', 'Opciones': 'Options', 'Descargar portadas y banners': 'Download covers and banners',
    'Sugerir renombrar carpetas': 'Suggest renaming folders', 'Borrar': 'Clear', 'Identificar reproductores instalados': 'Identify installed players',
    'Busca reproductores de video conocidos en las carpetas de programas y en el registro de Windows (solo lectura, no se modifica nada). Los que actives aparecen en': 'Looks for known video players in the program folders and in the Windows registry (read-only, nothing is modified). The ones you enable appear in',
    'clic derecho → Abrir con': 'right-click → Open with', 'Reproductores disponibles': 'Available players', 'Mostrar en «Abrir con»': 'Show in «Open with»', 'Quitar de la lista': 'Remove from the list',
    'horas vistas': 'hours watched', 'Formatos compatibles': 'Supported formats', 'sin conversión ·': 'no conversion ·', 'Modo compatible': 'Compatibility mode',
    'FFmpeg convierte al vuelo ·': 'FFmpeg converts on the fly ·', 'botón para abrirlo externo': 'button to open it externally', 'Portadas y fondos': 'Covers & backgrounds', 'Sistema': 'System',
    '— decodificación y conversión de formatos (LGPL/GPL) ·': '— decoding and format conversion (LGPL/GPL) ·', '— información de series ·': '— series information ·',
    'Videos personales, clases, etc.': 'Personal videos, classes, etc.', 'Otros': 'Other', 'Biblioteca': 'Library', 'serie': 'series', 'serie seleccionada': 'series selected', 'series seleccionadas': 'series selected',
    'Principal': 'Main', 'Estadísticas': 'Statistics', 'Tiempo visto': 'Time watched', 'Datos de la aplicación': 'App data', 'Datos': 'Data',
    'Cambiar nombre': 'Rename', 'Color del perfil': 'Profile color', 'Nombre del perfil': 'Profile name', 'Nuevo perfil': 'New profile', 'Eliminar perfil': 'Delete profile',
    'Buscar datos en internet para este grupo': 'Look up online data for this group', 'Ya está en la última versión': 'Already on the latest version',
    'Actualización disponible': 'Update available', 'Descargar': 'Download', 'Instalar y reiniciar': 'Install and restart', 'Buscando...': 'Checking...',
    'Copia de seguridad guardada': 'Backup saved', 'Copia restaurada': 'Backup restored', 'Restaurar': 'Restore',
    'Enlace de AniList, MyAnimeList, Kitsu, TVmaze o Wikipedia': 'Link from AniList, MyAnimeList, Kitsu, TVmaze or Wikipedia', 'Buscar en Google': 'Search on Google',
  });
  Object.assign(EN, {
    'Saltar %': 'Jump to %', 'Ej: Películas, Series, Clases...': 'E.g. Movies, Series, Classes...', 'Otro color': 'Another color', 'Buscar': 'Search',
    '¿No aparece? Pega el enlace de su página en AniList, MyAnimeList, Kitsu, TVmaze o Wikipedia': 'Not listed? Paste the link to its page on AniList, MyAnimeList, Kitsu, TVmaze or Wikipedia',
    'Buscar en Google (se abre el navegador)': 'Search on Google (opens the browser)', 'Usar': 'Use', 'Editar serie': 'Edit series', 'Nueva categoría (Enter para agregar)': 'New category (Enter to add)',
    'Agregar': 'Add', 'Vinculado a': 'Linked to', 'Cambiar coincidencia': 'Change match', 'Se quitan las carpetas de': 'The folders of', 'todos los grupos': 'all groups',
    '(los grupos se conservan).': 'are removed (the groups are kept).', ', y el progreso y los datos de internet se conservan por si vuelves a agregar las carpetas.': ', and progress and online data are kept in case you add the folders again.',
    'Antihéroe': 'Anti-Hero', 'Protagonista femenina': 'Female Protagonist', 'Protagonista masculino': 'Male Protagonist', 'Venganza': 'Revenge', 'Dioses': 'Gods', 'Militar': 'Military', 'Guerra': 'War', 'Magia': 'Magic',
    'Se borrará': 'This will delete', 'todo lo guardado en la app': 'everything saved in the app', ', como si la acabaras de instalar:': ', as if you had just installed it:',
    'Carpetas de la cartelera': 'Library folders', 'Progreso, «Continuar viendo» y capítulos vistos': 'Progress, «Continue watching» and watched episodes',
    'Datos de internet, nombres, portadas y fondos elegidos': 'Online data, names, chosen covers and backgrounds', 'Categorías propias y ajustes (color, subtítulos, reproductores externos…)': 'Custom categories and settings (color, subtitles, external players…)',
    'Miniaturas y caché': 'Thumbnails and cache', 'Tus archivos de video no se tocan.': 'Your video files are not touched.', 'Esto no se puede deshacer.': 'This can\'t be undone.',
  });
  PAT.push(
    [/^Buscar datos en internet para este grupo \((.+)\)$/, (m, a) => `Look up online data for this group (${a})`],
    [/^Elige el resultado correcto\. Se guardan título oficial, descripción, géneros, año, puntuación y portada(.*)$/, (m, a) => `Choose the correct result. The official title, description, genres, year, score and cover are saved${a.replace('(fuentes:', '(sources:')}`],
    [/^Vacío = automático \(nombre de la carpeta «(.+)» o el título de internet, según Ajustes\)$/, (m, a) => `Empty = automatic (folder name «${a}» or the online title, per Settings)`],
    [/^Géneros de internet: (.+)$/, (m, a) => `Online genres: ${a.split(', ').map((g) => tr(g) || g).join(', ')}`],
    [/^Quitar (\d+) carpetas?$/, (m, n) => `Remove ${n} folder${n === '1' ? '' : 's'}`],
  );
  Object.assign(EN, {
    'Uso de la tarjeta gráfica': 'Graphics card usage', 'Calidad máxima': 'Maximum quality', 'Equilibrado': 'Balanced', 'Ahorro': 'Saver',
    'La mejora de imagen no se usa en el modo de ahorro de GPU': 'Image enhancement isn\'t used in GPU saver mode',
  });
  PAT.push([/^Automático elige según tu equipo \(detectado: (.+) → (.+)\)\. Equilibrado .*$/, (m, a, b) => `Automatic picks based on your computer (detected: ${a} → ${tr(b) || b}). Balanced keeps the look but pauses the animated background and the glass effect while you watch a video. Saver removes the blur and processes color without WebGL, ideal for computers without a dedicated graphics card.`]);
  Object.assign(EN, {
    'Favoritos': 'Favorites', 'Favorito': 'Favorite', 'En favoritos': 'In favorites', 'Agregar a favoritos': 'Add to favorites', 'Quitar de favoritos': 'Remove from favorites',
    'Ver en la cartelera': 'View in library', 'Video agregado a favoritos': 'Video added to favorites', 'Kuro: todo listo': 'Kuro: all done', 'Apoyar el proyecto': 'Support the project', 'Invitar un café en Ko-fi': 'Buy me a coffee on Ko-fi', 'Kuro Player es gratis, sin anuncios y sin cuentas. Si te gusta y quieres apoyar su desarrollo, puedes invitarme un café en Ko-fi.': 'Kuro Player is free, with no ads and no accounts. If you like it and want to support its development, you can buy me a coffee on Ko-fi.', 'Contraer carpetas': 'Collapse folders', 'Mostrar carpetas': 'Show folders', 'No hay favoritos en esta carpeta.': 'No favorites in this folder.', 'Carpetas ·': 'Folders ·', 'Video quitado de favoritos': 'Video removed from favorites',
    'Duración:': 'Duration:', 'Menos de 1 minuto': 'Under 1 minute', 'De 1 a 5 minutos': '1 to 5 minutes', 'De 5 a 10 minutos': '5 to 10 minutes',
    'De 10 a 30 minutos': '10 to 30 minutes', 'Más de 30 minutos': 'Over 30 minutes', 'Calculando duraciones…': 'Measuring durations…',
    'No hay videos de esa duración.': 'No videos of that duration.', 'No hay videos de esa duración en esta carpeta.': 'No videos of that duration in this folder.', 'quitar filtro': 'clear filter', 'favoritos': 'favorites',
    'Series, películas y videos que marcaste con ♥.': 'Series, movies and videos you marked with ♥.',
  });
  PAT.push(
    [/^Kuro está trabajando: (.+)$/, (m, a) => `Kuro is working: ${a.replace('Revisando la biblioteca', 'Checking the library').replace('Midiendo la duración de los videos', 'Measuring video durations').replace(/Buscando datos en internet/, 'Looking up online data').replace(/Generando miniaturas \((\d+) pendientes\)/, 'Generating thumbnails ($1 pending)')}`],
    [/^Video (\d+) de (\d+) · lista de favoritos$/, (m, a, b) => `Video ${a} of ${b} · favorites list`],
    [/^«(.+)» agregado a favoritos$/, (m, a) => `«${a}» added to favorites`],
    [/^«(.+)» quitado de favoritos$/, (m, a) => `«${a}» removed from favorites`],
    [/^Calculando duraciones… (\d+)\/(\d+)$/, (m, a, b) => `Measuring durations… ${a}/${b}`],
    [/^(\d+) videos? · (.+)$/, (m, n, b) => `${n} video${n === '1' ? '' : 's'} · ${tr(b) || b}`],
    [/^(\d+) videos?$/, (m, n) => `${n} video${n === '1' ? '' : 's'}`],
  );
  const MONTHS = { Enero: 'January', Febrero: 'February', Marzo: 'March', Abril: 'April', Mayo: 'May', Junio: 'June', Julio: 'July', Agosto: 'August', Septiembre: 'September', Octubre: 'October', Noviembre: 'November', Diciembre: 'December' };
  PAT.push(
    [/^(.+) · (\d+) series \(clic derecho para opciones\)$/, (m, a, n) => `${a} · ${n} series (right-click for options)`],
    [/^(.+) · (\d+) (películas?|títulos?) \(clic derecho para opciones\)$/, (m, a, n, w) => `${a} · ${n} ${tr(w) || w} (right-click for options)`],
    [/^Continuar (.+)$/, (m, a) => `Continue ${tr(a) || a}`],
    [/^(\S+) restantes$/, (m, a) => `${a} left`],
    [/^Visto hace un momento$/, () => 'Watched just now'],
    [/^Visto (.+ ago|just now)$/, (m, a) => `Watched ${a}`],
    [/^Visto hace (.+)$/, (m, a) => `Watched ${a.replace('días', 'days').replace('día', 'day')} ago`],
    [/^hace un momento$/, () => 'just now'],
    [/^hace (.+)$/, (m, a) => `${a.replace('días', 'days').replace('día', 'day')} ago`],
    [/^Ver en (.+)$/, (m, a) => `View on ${a}`],
    [/^Continuando desde (.+)$/, (m, a) => `Resuming from ${a}`],
    [/^Abrir con (.+)$/, (m, a) => `Open with ${tr(a) || a}`],
    [/^(.+) {1,2}\(actual\)$/, (m, a) => `${a} (current)`],
    [/^\((\d+) grupos? · (\d+) carpetas?\)$/, (m, g, c) => `(${g} group${g === '1' ? '' : 's'} · ${c} folder${c === '1' ? '' : 's'})`],
    [/^(\d+) serie$/, (m, n) => `${n} series`],
    [/^✓ (\d+) vistos?$/, (m, n) => `✓ ${n} watched`],
    [/^✓ (\d+) vinculadas?$/, (m, n) => `✓ ${n} linked`],
    [/^(\d+) por confirmar$/, (m, n) => `${n} to confirm`],
    [/^(\d+) sin coincidencia$/, (m, n) => `${n} no match`],
    [/^(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) (\d{4})$/, (m, a, y) => `${MONTHS[a]} ${y}`],
    [/^(.+) \(externo\)$/, (m, a) => `${a} (external)`],
    [/^(.+) incrustado$/, (m, a) => `${a} embedded`],
    [/^(.+) \(8 bits\)$/, (m, a) => `${a} (8-bit)`],
    [/^Kuro Player v(.+)$/, (m, a) => `Kuro Player v${a}`],
  );

  // fragmentos que aparecen dentro de textos más largos (se aplican de mayor a menor)
  const FRAG = [
    ['capítulos vistos', 'episodes watched'], ['capítulos nuevos', 'new episodes'], ['títulos con datos', 'titles with data'], ['con datos web', 'with web data'],
    ['por confirmar', 'to confirm'], ['sin coincidencia', 'no match'], ['sin buscar', 'not searched'], ['sin búsqueda en internet', 'no online search'], ['busca datos en internet', 'searches online data'],
    ['en disco', 'on disk'], ['carpetas', 'folders'], ['carpeta', 'folder'], ['capítulos', 'episodes'], ['capítulo', 'episode'], ['películas', 'movies'], ['película', 'movie'], ['títulos', 'titles'], ['vistos', 'watched'], ['visto', 'watched'],
    ['Temporada', 'Season'],
  ].sort((a, b) => b[0].length - a[0].length);

  // contenido del usuario (títulos, sinopsis, nombres de archivo): nunca se traduce
  const NOTR = '.p-title, .lcard-title, .lc-title, .synopsis, .e-s, .wr-t, .ri-t b, .no-art, #now-meta, .cc-s, .cc-t, .tl-body, .changelog, input, textarea, .notr, [translate="no"], #series-view h1, .hero h1, .sub-line, #subs';

  const SPANISH = /[áéíóúñ¿¡«»]|\b(de|del|la|las|los|el|en|con|sin|para|por|que|una?|capítulos?|películas?|títulos?|vistos?|Ver|Abrir|Buscar|Quitar|Agregar|Cerrar)\b/;
  const missing = new Set();

  function tr(s) {
    if (!s) return null;
    if (Object.prototype.hasOwnProperty.call(EN, s)) return EN[s];
    for (const [re, fn] of PAT) { const m = s.match(re); if (m) return fn(...m); }
    return null;
  }
  function trLoose(s) {
    const t = tr(s);
    if (t != null) return t;
    if (s.length > 90 || !SPANISH.test(s)) { if (/[a-zá-ú]{3}/.test(s)) missing.add(s); return null; }
    let out = s, hit = false;
    for (const [a, b] of FRAG) if (out.includes(a)) { out = out.split(a).join(b); hit = true; }
    if (!hit || out === s) { missing.add(s); return null; }
    if (SPANISH.test(out)) missing.add(s);
    return out;
  }

  const done = new WeakMap(), doneAttr = new WeakMap();
  function skip(el) { return !el || (el.closest && el.closest(NOTR)); }
  function trText(n) {
    if (done.get(n) === n.data) return;
    const raw = n.data, s = raw.trim();
    if (!s || !/[A-Za-zÁ-ú]/.test(s)) return;
    if (skip(n.parentElement)) return;
    const t = trLoose(s);
    if (t != null && t !== s) { n.data = raw.replace(s, t); }
    done.set(n, n.data);
  }
  const ATTRS = ['title', 'placeholder', 'aria-label', 'data-tip'];
  function trAttrs(el) {
    if (skip(el.parentElement) && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
    let d = doneAttr.get(el);
    if (!d) doneAttr.set(el, (d = {}));
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || d[a] === v) continue;
      const t = trLoose(v.trim());
      d[a] = t != null ? t : v;
      if (t != null && t !== v) el.setAttribute(a, t);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { trText(root); return; }
    if (root.nodeType !== 1) return;
    if (root.hasAttribute) trAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) trText(n);
      else if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') continue;
      else trAttrs(n);
    }
  }
  function start() {
    if (lang !== 'en') return;
    document.documentElement.lang = 'en';
    walk(document.body);
    walk(document.head.querySelector('title') || document.createTextNode(''));
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'characterData') trText(m.target);
        else if (m.type === 'attributes') trAttrs(m.target);
        else for (const n of m.addedNodes) walk(n);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function setLang(l) {
    try { localStorage.setItem('kp-lang', l); } catch (e) { /* */ }
    if (l !== lang) location.reload();
  }
  // texto suelto para confirm()/prompt() u otros usos desde el código
  function t(s) { return lang === 'en' ? (trLoose(s) || s) : s; }

  return { get lang() { return lang; }, start, setLang, t, missing, tr };
})();
