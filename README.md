# POGO — Valencia Field Atlas

Mapa de exploración de spawns que lee una tabla de Baserow desde una función de Vercel. El navegador nunca recibe el token de Baserow.

## Despliegue

1. Importa este repositorio en Vercel y deja el preset como **Other** (funciones Node.js y archivos estáticos).
2. Añade las variables del apartado siguiente en Vercel, en los entornos que vayas a usar.
3. Despliega. Para desarrollo local, instala Vercel CLI (`npm i -g vercel`) y ejecuta `npm run dev`.

## Variables de entorno

Copia `.env.example` como referencia y configura:

| Variable | Requerida | Valor inicial / propósito |
|---|---:|---|
| `BASEROW_URL` | Sí | URL base de la instancia, por defecto `https://api.baserow.io` |
| `BASEROW_TOKEN` | Sí | Token de base de datos con permiso de lectura |
| `BASEROW_TABLE_ID` | Sí | ID de la tabla de spawns |
| `BASEROW_LAT_FIELD` | No | Nombre de campo de latitud, por defecto `latitude` |
| `BASEROW_LON_FIELD` | No | Nombre de campo de longitud, por defecto `longitude` |
| `BASEROW_SPECIES_FIELD` | No | Especie, por defecto `species` |
| `BASEROW_TIME_FIELD` | No | Fecha/hora del spawn, por defecto `timestamp` |
| `BASEROW_NAME_FIELD` | No | Nombre descriptivo, por defecto `name` |

El endpoint lee todas las páginas de la tabla (hasta 20.000 filas) con `user_field_names=true` y comparte de forma segura los nombres de campo configurados con el navegador. La normalización reconoce además `lat`, `lng`, `pokemon`, `created_on` y `title` como nombres alternativos.

## Comportamiento confirmado en el código

- Centro de inicio: Valencia, `39.4699, -0.3763`.
- Distancia geodésica calculada con Haversine y radio terrestre medio de 6371.0088 km.
- Los registros visibles se limitan siempre a un máximo de 100 km y al radio seleccionado: 5, 10, 25, 50 o 100 km.
- El contorno discontinuo marca siempre el radio máximo de 100 km; el círculo tenue marca el radio seleccionado. El mapa encuadra el círculo al cargar, cambiar radio o mover el centro. El heatmap usa exactamente la lista de registros filtrada.
- Se puede cambiar el centro con coordenadas, arrastrando el marcador o haciendo clic en el mapa.
- Hay 13 zonas guardadas como centros aproximados. Cada zona cuenta registros dentro de 1.5 km; el ranking usa partes iguales de volumen de registros, especies distintas y horas locales activas, normalizadas respecto a la zona con valor más alto de cada métrica dentro del radio.
- El análisis horario usa la hora local del dispositivo. Las zonas y sus coordenadas son centros representativos, no límites administrativos ni polígonos.

## Estado pendiente de datos

En esta carpeta no se proporcionó una tabla ni esquema de Baserow. Las credenciales, ID de tabla y nombres reales de campos quedan **desconocidos** hasta que se configuren en Vercel. Sin ellos, la app muestra el motivo de conexión pendiente y no inventa registros. Las baldosas del mapa y Leaflet se cargan desde OpenStreetMap y un CDN público, por lo que el navegador necesita acceso a Internet.
