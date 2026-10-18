const API = 'https://map.pokecoords.com/api';
const EARTH_KM = 6371.0088;
const RADII = new Set([5, 10, 25, 50, 100]);

function distanceKm(a, b) {
  const rad = (value) => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function credentials() {
  const bearer = process.env.POKECOORDS_BEARER_TOKEN;
  const session = process.env.POKECOORDS_SESSION_TOKEN;
  if (!bearer || !session) return null;
  return {
    Authorization: `Bearer ${bearer}`,
    Cookie: `session_token=${session}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-language': 'en',
  };
}

async function readFeed(headers) {
  const response = await fetch(`${API}/feed/`, { headers });
  if (!response.ok) throw new Error(`Lectura de configuración PokéCoords: HTTP ${response.status}.`);
  const feed = await response.json();
  const entries = Array.isArray(feed) ? feed : [];
  return entries.find((item) => item && typeof item.filter_id === 'string') || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radius = Number(req.query.radius || 25);
  const onlyHundos = req.query.hundos === 'true';
  const pokemonId = req.query.pokemonId ? Number(req.query.pokemonId) : null;
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180 || !RADII.has(radius)) {
    return res.status(400).json({ error: 'Centro o radio no válido. Radios permitidos: 5, 10, 25, 50 y 100 km.' });
  }
  if (pokemonId !== null && (!Number.isInteger(pokemonId) || pokemonId < 1 || pokemonId > 2000)) {
    return res.status(400).json({ error: 'El número de Pokédex no es válido.' });
  }

  const headers = credentials();
  if (!headers) {
    return res.status(503).json({ error: 'Falta configurar el acceso de PokéCoords en Vercel.' });
  }

  try {
    const savedFilter = onlyHundos ? null : await readFeed(headers);
    if (!onlyHundos && !savedFilter) {
      return res.status(502).json({ error: 'PokéCoords no devolvió una configuración de búsqueda.' });
    }

    // La petición reproduce los campos geográficos observados en el HAR.
    // Para el modo hundo se combina el filtro permanente de 100% con ese ámbito.
    const body = {
      filter_id: onlyHundos ? 'permanent_100iv_filter' : savedFilter.filter_id,
      min_iv: onlyHundos ? 100 : 0,
      max_iv: 100,
      min_lv: onlyHundos ? 0 : 1,
      max_lv: 35,
      latitude: lat,
      longitude: lon,
      range: radius * 1000,
    };
    if (pokemonId !== null) body.selected_dex = [pokemonId];

    const response = await fetch(`${API}/pokemon/worldwide`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = response.status === 401 || response.status === 403
        ? 'La sesión de PokéCoords ha caducado o no tiene acceso.'
        : `PokéCoords respondió HTTP ${response.status}.`;
      return res.status(response.status === 401 || response.status === 403 ? 502 : response.status).json({ error: detail });
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) return res.status(502).json({ error: 'PokéCoords devolvió una respuesta inesperada.' });
    const center = { lat, lon };
    const unique = new Map();
    for (const row of rows) {
      const rowLat = Number(row.lat);
      const rowLon = Number(row.lng);
      if (!Number.isFinite(rowLat) || !Number.isFinite(rowLon)) continue;
      const distance = distanceKm(center, { lat: rowLat, lon: rowLon });
      if (distance > radius) continue;
      const key = String(row.id ?? `${row.dex}:${rowLat}:${rowLon}:${row.despawn}`);
      if (!unique.has(key)) unique.set(key, { ...row, distance_km: Number(distance.toFixed(3)) });
    }

    const spawns = [...unique.values()];
    return res.status(200).json({
      provider: 'PokéCoords', center, radius_km: radius,
      count: spawns.length,
      hundos: spawns.filter((row) => Number(row.iv) === 100).length,
      generated_at: new Date().toISOString(), spawns,
    });
  } catch (error) {
    return res.status(502).json({ error: 'No se pudo consultar el feed de PokéCoords.', detail: error.message });
  }
};
