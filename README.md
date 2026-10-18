# POGO — Buscador Valencia y Zaragoza

Aplicación web para localizar spawns activos y Pokémon con IV perfecto en Valencia, Zaragoza y cualquier centro manual. Los datos se consultan desde el endpoint público de [iFlowGo PoGo Radar](https://pokecoords.iflowgo.com/). No he confirmado que ese endpoint sea el backend de pokecoords.com/map; la app no genera ni inventa avistamientos.

## Funcionamiento

- El navegador consulta `/api/spawns`; la función de Vercel consulta el feed del proveedor y nunca expone credenciales.
- Centros guardados: Valencia `39.4699, -0.3763` y Zaragoza `41.65624, -0.8788`.
- Radios: 5, 10, 25, 50 y 100 km. El proveedor limita cada consulta a 25 km; la función combina consultas contiguas, quita duplicados y vuelve a filtrar por distancia Haversine.
- El mapa muestra spawns activos, resalta los hundos (IV 100%) y permite abrir sus coordenadas en Google Maps.
- El filtro “Mostrar solo hundos” y el filtro por número de Pokédex se aplican a mapa y lista.
- Los resultados son efímeros: el feed incluye la hora de expiración. La lista se actualiza automáticamente cada 30 segundos.
- El proveedor devuelve el ID de Pokédex, pero no el nombre localizado de la especie en esta respuesta; por eso se muestra como `Pokémon #ID`.

## Despliegue

No se necesitan variables de Baserow para consultar el feed. En Vercel, despliega el proyecto como aplicación estática con funciones Node.js. Para desarrollo local, instala Vercel CLI y ejecuta `npm run dev`.

## Limitaciones conocidas

- El endpoint de iFlowGo responde actualmente sin token. No encontramos documentación oficial pública para integradores. Puede cambiar o limitar acceso; la aplicación muestra el error devuelto en vez de datos simulados.
- La respuesta de proximidad consultada en Zaragoza contenía spawns normales pero ningún hundo, y Valencia devolvió 0 spawns en 25 km en la consulta realizada el 18 de octubre de 2026. La cobertura depende del proveedor y del momento.
- No se dispone en esta respuesta de historial fiable de apariciones, por lo que no se calculan frecuencia horaria ni rankings históricos.
- Para radios de 50 y 100 km se realizan múltiples consultas al proveedor; el tiempo de respuesta puede aumentar.
