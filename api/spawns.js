const SOURCE = 'https://pokecoords.iflowgo.com/iflowgopokecoords/api/v1/nearby';
const MAX_RADIUS_KM = 25;
const EARTH_KM = 6371.0088;

const distanceKm = (a, b) => {
  const rad = (v) => v * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

function tileCenters(center, radius) {
  if (radius <= MAX_RADIUS_KM) return [center];
  const spacing = 40;
  const rowStep = spacing * Math.sqrt(3) / 2;
  const centers = [center];
  const extent = radius + MAX_RADIUS_KM;
  const minRow = Math.floor(-extent / rowStep), maxRow = Math.ceil(extent / rowStep);
  for (let row = minRow; row <= maxRow; row += 1) {
    const northKm = row * rowStep;
    const offsetX = Math.abs(row % 2) * spacing / 2;
    const minCol = Math.floor((-extent - offsetX) / spacing), maxCol = Math.ceil((extent - offsetX) / spacing);
    for (let col = minCol; col <= maxCol; col += 1) {
      const eastKm = col * spacing + offsetX;
      if (Math.hypot(northKm, eastKm) > radius + MAX_RADIUS_KM) continue;
      const lat = center.lat + northKm / 111.195;
      const lon = center.lon + eastKm / (111.195 * Math.cos(center.lat * Math.PI / 180));
      const candidate = { lat, lon };
      if (distanceKm(center, candidate) <= radius + MAX_RADIUS_KM && !centers.some((p) => distanceKm(p, candidate) < 1)) centers.push(candidate);
    }
  }
  return centers;
}

async function queryTile(center, signal) {
  const params = new URLSearchParams({
    lat: String(center.lat), lon: String(center.lon), radius_km: String(MAX_RADIUS_KM),
    layers: 'spawns', limit: '800',
  });
  const response = await fetch(`${SOURCE}?${params}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`El feed respondió HTTP ${response.status}.`);
  const data = await response.json();
  if (!Array.isArray(data.spawns)) throw new Error('El feed devolvió una respuesta sin lista de spawns.');
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const lat = Number(req.query.lat), lon = Number(req.query.lon), radius = Number(req.query.radius || 25);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || ![5, 10, 25, 50, 100].includes(radius)) {
    return res.status(400).json({ error: 'Centro o radio no válido. Radios permitidos: 5, 10, 25, 50 y 100 km.' });
  }

  const center = { lat, lon };
  const centers = tileCenters(center, radius);
  const rows = [];
  try {
    for (let i = 0; i < centers.length; i += 12) {
      const batch = centers.slice(i, i + 12);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      let pages;
      try { pages = await Promise.all(batch.map((tile) => queryTile(tile, controller.signal))); }
      finally { clearTimeout(timer); }
      for (const page of pages) rows.push(...page.spawns);
    }
    const unique = new Map();
    for (const row of rows) {
      if (!Number.isFinite(Number(row.lat)) || !Number.isFinite(Number(row.lon))) continue;
      const distance = distanceKm(center, { lat: Number(row.lat), lon: Number(row.lon) });
      if (distance > radius) continue;
      const key = row.id || `${row.pokemon_id}:${row.lat}:${row.lon}:${row.expires_at}`;
      if (!unique.has(key)) unique.set(key, { ...row, distance_m: Math.round(distance * 1000) });
    }
    const spawns = [...unique.values()].sort((a, b) => new Date(a.expires_at) - new Date(b.expires_at));
    return res.status(200).json({
      provider: 'iFlowGo PoGo Radar', center, radius_km: radius,
      tile_count: centers.length, count: spawns.length,
      hundos: spawns.filter((row) => Number(row.percent_iv) === 100).length,
      generated_at: new Date().toISOString(), spawns,
    });
  } catch (error) {
    const timeout = error.name === 'AbortError';
    return res.status(502).json({
      error: timeout ? 'El feed tardó demasiado en responder.' : 'No se pudo consultar el feed de spawns.',
      detail: error.message, provider: 'iFlowGo PoGo Radar',
    });
  }
};
