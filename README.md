# POGO — Buscador Valencia y Zaragoza

Mapa personal de apariciones de PokéCoords. El proxy consulta el endpoint observado en el HAR y calcula de nuevo la distancia con Haversine antes de devolver los resultados al navegador.

## Configuración

La función de Vercel espera estas variables secretas:

- `POKECOORDS_BEARER_TOKEN`
- `POKECOORDS_SESSION_TOKEN`

No se guardan credenciales en el repositorio. El HAR adjunto no incluye las cabeceras sensibles. El token Bearer capturado en el mensaje anterior tenía una caducidad breve; por tanto, no se considera una credencial permanente. El HAR todavía no documenta un flujo de renovación.

## Integración observada

- `GET /api/feed/` devuelve el identificador del filtro guardado.
- `POST /api/pokemon/worldwide` devuelve apariciones con `lat`, `lng`, `dex`, `name`, `iv`, `attack`, `defense`, `stamina` y `despawn`.
- La búsqueda por especie incluye `latitude`, `longitude`, `range` en metros y `selected_dex`.
- El filtro permanente de IV 100% usa `filter_id=permanent_100iv_filter` y `min_iv=max_iv=100`.

La función combina el filtro permanente de hundos con los campos geográficos observados. Esa combinación no aparece junta en el HAR y queda pendiente de una respuesta real de la API para considerarla probada.

## Estado

- **Observado:** petición local por especie, respuesta con una aparición, y petición mundial de hundos con 100 resultados.
- **Configurado en el código:** Valencia, Zaragoza, radios 5/10/25/50/100 km, filtro Haversine, marcadores y heatmap.
- **Desconocido:** renovación automática de sesión y aceptación de radios superiores a los 80 km de la consulta local capturada.
- **No probado:** esta adaptación requiere credenciales válidas en Vercel y una consulta real para confirmar la combinación local de hundos.
