const API = 'https://pokemongocoordinates.com/api/shiny-radar';
const RADII = new Set([5, 10, 25, 50]);

function credentials() {
  const cookie = process.env.PGC_SESSION_COOKIE?.replace(/[\r\n]+/g, '').trim();
  if (!cookie) return null;
  return { Cookie: cookie, Accept: 'application/json' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const radius = Number(req.query.radius || 25);
  if (!RADII.has(radius)) {
    return res.status(400).json({ error: 'Radio no válido. Radios permitidos: 5, 10, 25 y 50 km.' });
  }

  const headers = credentials();
  if (!headers) {
    return res.status(503).json({ error: 'Falta configurar la sesión de Shiny Radar en Vercel.' });
  }

  try {
    const response = await fetch(`${API}?radius_km=${radius}`, { headers });
    if (!response.ok) {
      const detail = response.status === 401 || response.status === 403
        ? 'La sesión de Shiny Radar ha caducado o no tiene VIP.'
        : `Shiny Radar respondió HTTP ${response.status}.`;
      return res.status(response.status === 401 || response.status === 403 ? 502 : response.status).json({ error: detail });
    }

    const data = await response.json();
    if (!Array.isArray(data.cards)) return res.status(502).json({ error: 'Shiny Radar devolvió una respuesta inesperada.' });

    // Se devuelven solo los resultados: la respuesta original incluye el Friend Code y los datos del entrenador.
    return res.status(200).json({
      provider: 'PokéCoords Shiny Radar',
      generated_at: data.generatedAt,
      total_checked: data.totalChecked,
      count: data.cards.length,
      cards: data.cards,
    });
  } catch (error) {
    return res.status(502).json({ error: 'No se pudo consultar Shiny Radar.', detail: error.message });
  }
};
