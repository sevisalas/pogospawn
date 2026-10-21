const API = 'https://pokemongocoordinates.com/api/shiny-radar';
const ORIGIN = 'https://pokemongocoordinates.com';
const RADII = new Set([5, 10, 25, 50]);

function credentials() {
  const cookie = process.env.PGC_SESSION_COOKIE?.replace(/[\r\n]+/g, '').trim();
  if (!cookie) return null;
  return { Cookie: cookie, Accept: 'application/json', Origin: ORIGIN, Referer: `${ORIGIN}/shiny-radar/` };
}

function failure(res, response) {
  const expired = response.status === 401 || response.status === 403;
  const detail = expired
    ? 'La sesión de Shiny Radar ha caducado o no tiene VIP.'
    : `Shiny Radar respondió HTTP ${response.status}.`;
  return res.status(expired ? 502 : response.status).json({ error: detail });
}

// Cambia la cuenta (Friend Code) activa del radar. Los shinys de las consultas siguientes son los de esa cuenta.
async function selectAccount(req, res, headers) {
  const slot = Number(req.body?.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > 5) {
    return res.status(400).json({ error: 'Cuenta no válida. Las posiciones permitidas son de 1 a 5.' });
  }
  const response = await fetch(`${API}/select`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slot }),
  });
  if (!response.ok) return failure(res, response);
  return res.status(200).json({ ok: true, slot });
}

// Da de alta un Friend Code nuevo en el radar (máximo 5 cuentas). Tarda unos segundos en resolver el entrenador.
async function enrollAccount(req, res, headers) {
  const friendCode = String(req.body?.friend_code ?? '').replace(/\D/g, '');
  if (friendCode.length !== 12) {
    return res.status(400).json({ error: 'El Friend Code debe tener 12 dígitos.' });
  }
  const response = await fetch(`${API}/enroll`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ friend_code: friendCode }),
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json()).error || ''; } catch { /* sin cuerpo */ }
    if (response.status === 401 || response.status === 403) return failure(res, response);
    return res.status(response.status).json({ error: detail || `Shiny Radar respondió HTTP ${response.status}.` });
  }
  return res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const headers = credentials();
  if (!headers) {
    return res.status(503).json({ error: 'Falta configurar la sesión de Shiny Radar en Vercel.' });
  }

  try {
    if (req.method === 'POST') {
      return req.body?.friend_code !== undefined
        ? await enrollAccount(req, res, headers)
        : await selectAccount(req, res, headers);
    }

    const radius = Number(req.query.radius || 25);
    if (!RADII.has(radius)) {
      return res.status(400).json({ error: 'Radio no válido. Radios permitidos: 5, 10, 25 y 50 km.' });
    }

    const response = await fetch(`${API}?radius_km=${radius}`, { headers });
    if (!response.ok) return failure(res, response);

    const data = await response.json();
    if (!Array.isArray(data.cards)) return res.status(502).json({ error: 'Shiny Radar devolvió una respuesta inesperada.' });

    // La respuesta original incluye datos de la sesión y del entrenador: solo se reenvía lo necesario.
    // El Friend Code ya llega enmascarado (•••• •••• 1234).
    const accounts = (data.accounts || []).map((account) => ({
      slot: account.slot,
      active: account.active,
      connected: account.connected,
      friend_code: account.friendCode,
      trainer: account.trainer ? { name: account.trainer.name, level: account.trainer.level, team: account.trainer.team } : null,
    }));
    return res.status(200).json({
      provider: 'PokéCoords Shiny Radar',
      generated_at: data.generatedAt,
      total_checked: data.totalChecked,
      count: data.cards.length,
      accounts,
      cards: data.cards,
    });
  } catch (error) {
    return res.status(502).json({ error: 'No se pudo consultar Shiny Radar.', detail: error.message });
  }
};
