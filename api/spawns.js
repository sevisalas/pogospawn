const env = (name, fallback) => process.env[name] || fallback;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const base = env('BASEROW_URL', 'https://api.baserow.io').replace(/\/$/, '');
  const token = process.env.BASEROW_TOKEN;
  const table = process.env.BASEROW_TABLE_ID;
  if (!token || !table) {
    return res.status(503).json({
      error: 'Falta configurar BASEROW_TOKEN o BASEROW_TABLE_ID en las variables de entorno de Vercel.',
      configured: false,
    });
  }

  try {
    const rows = [];
    let url = `${base}/api/database/rows/table/${encodeURIComponent(table)}/?user_field_names=true&size=200`;
    let pageCount = 0;
    while (url && pageCount < 100) {
      const response = await fetch(url, {
        headers: { Authorization: `Token ${token}`, Accept: 'application/json' },
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        return res.status(response.status === 401 || response.status === 403 ? 502 : response.status)
          .json({ error: `Baserow respondió ${response.status}.`, detail });
      }
      const page = await response.json();
      if (!Array.isArray(page.results)) throw new Error('Respuesta de filas no reconocida.');
      rows.push(...page.results);
      url = page.next || null;
      pageCount += 1;
    }
    if (url) return res.status(502).json({ error: 'La tabla supera el límite de paginación (20.000 filas).' });
    return res.status(200).json({
      rows,
      count: rows.length,
      configured: true,
      fields: {
        lat: env('BASEROW_LAT_FIELD', 'latitude'),
        lon: env('BASEROW_LON_FIELD', 'longitude'),
        species: env('BASEROW_SPECIES_FIELD', 'species'),
        time: env('BASEROW_TIME_FIELD', 'timestamp'),
        name: env('BASEROW_NAME_FIELD', 'name'),
      },
    });
  } catch (error) {
    return res.status(502).json({ error: 'No se pudo leer Baserow.', detail: error.message });
  }
};
