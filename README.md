# POGO — Buscador Valencia y Zaragoza

Mapa personal de apariciones de PokéCoords. El proxy consulta el endpoint observado en el HAR y calcula de nuevo la distancia con Haversine antes de devolver los resultados al navegador.

## Configuración

La función de Vercel espera estas variables secretas:

- `POKECOORDS_BEARER_TOKEN`
- `POKECOORDS_SESSION_TOKEN`

No se guardan credenciales en el repositorio. El HAR adjunto no incluye las cabeceras sensibles. El token Bearer capturado en el mensaje anterior tenía una caducidad breve; por tanto, no se considera una credencial permanente. El HAR todavía no documenta un flujo de renovación.

## Integración observada

- `POST /api/pokemon/worldwide` devuelve apariciones con `lat`, `lng`, `dex`, `name`, `iv`, `attack`, `defense`, `stamina` y `despawn`.
- La búsqueda por especie incluye `latitude`, `longitude`, `range` en metros, `selected_dex` y el filtro `f-3s6icymuvdx3io`.
- El filtro permanente de IV 100% usa `filter_id=permanent_100iv_filter` y `min_iv=max_iv=100`.

La función combina el filtro permanente de hundos con los campos geográficos observados. Esa combinación no aparece junta en el HAR y queda pendiente de una respuesta real de la API para considerarla probada. El filtro normal usa el ID de filtro de la búsqueda por especie capturada en el HAR; no consulta un endpoint `/feed/`.

## Estado

- **Observado:** petición local por especie, respuesta con una aparición, y petición mundial de hundos con 100 resultados. Las llamadas autenticadas incluyen Bearer y cookie `session_token`.
- **Configurado en el código:** Valencia, Zaragoza, radios 5/10/25/50/100 km, filtro Haversine, marcadores y heatmap.
- **Desconocido:** renovación automática de sesión, aceptación de radios superiores a los 80 km de la consulta local capturada y si el ID de filtro por especie permanece estable.
- **No probado:** esta adaptación requiere credenciales válidas en Vercel y una consulta real para confirmar la combinación local de hundos.
