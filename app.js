(() => {
  const CITIES = [
    { key: 'valencia', name: 'Valencia', lat: 39.4699, lon: -0.3763 },
    { key: 'zaragoza', name: 'Zaragoza', lat: 41.65624, lon: -0.8788 },
  ];
  const RADII = [5, 10, 25, 50, 100];
  const HOME = CITIES[0];
  const state = {
    center: { lat: HOME.lat, lon: HOME.lon }, activeCity: HOME.key, resetCity: HOME.key, radius: 25,
    rawRows: [], rows: [], map: null, heat: null, markers: null, centerMarker: null, radiusCircle: null,
    lastUpdated: null, loading: false,
  };
  const $ = (id) => document.getElementById(id);
  const num = (v) => typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  const rad = (d) => d * Math.PI / 180;
  const distanceKm = (a, b) => {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const speciesName = (id, name) => name || `Pokémon #${id}`;
  const fmtTime = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  const timeLeft = (value) => {
    const secs = Math.max(0, Math.floor((new Date(value).getTime() - Date.now()) / 1000));
    return `${Math.floor(secs / 60)} min ${String(secs % 60).padStart(2, '0')} s`;
  };
  const toast = (message) => { const el = $('toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3500); };

  function normalize(row) {
    const lat = num(row.lat), lon = num(row.lng), id = Number(row.dex);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const rawDespawn = row.despawn;
    const expiry = typeof rawDespawn === 'number' || /^\d+$/.test(String(rawDespawn ?? ''))
      ? new Date(Number(rawDespawn) < 1e12 ? Number(rawDespawn) * 1000 : Number(rawDespawn)).toISOString()
      : rawDespawn || null;
    return {
      id: String(row.id ?? `${id}-${lat}-${lon}-${rawDespawn}`), pokemonId: id, species: speciesName(id, row.name), lat, lon,
      cp: Number(row.cp) || 0, level: Number(row.level) || 0, iv: Number(row.iv) || 0,
      atk: Number(row.attack) || 0, def: Number(row.defense) || 0, sta: Number(row.stamina) || 0,
      expiresAt: expiry, original: row,
    };
  }

  function initControls() {
    $('radius-options').innerHTML = RADII.map((radius) => `<button class="radius-option${radius === state.radius ? ' active' : ''}" data-radius="${radius}" aria-pressed="${radius === state.radius}">${radius}</button>`).join('');
    $('radius-options').addEventListener('click', (event) => {
      const button = event.target.closest('[data-radius]'); if (!button) return;
      state.radius = Number(button.dataset.radius);
      document.querySelectorAll('.radius-option').forEach((b) => { const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
      $('radius-label').textContent = `${state.radius} km`; fitRadius(); loadData();
    });
    $('city-options').innerHTML = CITIES.map((city) => `<button class="city-option${city.key === state.activeCity ? ' active' : ''}" data-city="${city.key}" aria-pressed="${city.key === state.activeCity}">${safe(city.name)}</button>`).join('');
    $('city-options').addEventListener('click', (event) => {
      const button = event.target.closest('[data-city]'); if (!button) return;
      const city = CITIES.find((item) => item.key === button.dataset.city); if (!city) return;
      state.resetCity = city.key; setCenter(city.lat, city.lon, true, city.key); loadData();
    });
    $('apply-center').addEventListener('click', () => {
      const lat = num($('center-lat').value), lon = num($('center-lon').value);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return toast('Introduce latitud y longitud válidas.');
      setCenter(lat, lon); loadData();
    });
    $('reset-center').addEventListener('click', () => {
      const city = CITIES.find((item) => item.key === state.resetCity) || HOME;
      setCenter(city.lat, city.lon, true, city.key); loadData();
    });
    $('refresh').addEventListener('click', loadData);
    $('only-hundos').addEventListener('change', loadData);
    $('pokemon-filter').addEventListener('input', render);
  }

  function initMap() {
    if (!window.L) { $('data-status').textContent = 'No se pudo cargar el mapa'; return; }
    state.map = L.map('map', { zoomControl: true }).setView([state.center.lat, state.center.lon], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(state.map);
    state.radiusCircle = L.circle([state.center.lat, state.center.lon], { radius: state.radius * 1000, color: '#789566', weight: 1.5, dashArray: '5 6', fillColor: '#a5e865', fillOpacity: 0.035, interactive: false }).addTo(state.map);
    state.centerMarker = L.marker([state.center.lat, state.center.lon], { icon: L.divIcon({ className: '', html: '<span class="center-marker"></span>', iconSize: [14, 14], iconAnchor: [7, 7] }), draggable: true }).addTo(state.map).bindTooltip('Centro de análisis');
    state.centerMarker.on('dragend', () => { const p = state.centerMarker.getLatLng(); setCenter(p.lat, p.lng, false); loadData(); });
    state.map.on('click', (event) => { setCenter(event.latlng.lat, event.latlng.lng); loadData(); });
    state.markers = L.layerGroup().addTo(state.map);
    if (L.heatLayer) state.heat = L.heatLayer([], { radius: 22, blur: 18, maxZoom: 16, minOpacity: 0.22, gradient: { 0.2: '#b5e7e7', 0.45: '#80d0a5', 0.7: '#ffd267', 1: '#ed704c' } }).addTo(state.map);
    fitRadius(); setTimeout(() => state.map.invalidateSize(), 100);
  }

  function fitRadius() {
    if (!state.map || !state.radiusCircle) return;
    state.radiusCircle.setLatLng([state.center.lat, state.center.lon]);
    state.radiusCircle.setRadius(state.radius * 1000);
    state.map.fitBounds(state.radiusCircle.getBounds(), { padding: [18, 18], maxZoom: 13 });
  }

  function setCenter(lat, lon, updateInputs = true, cityKey = null) {
    state.center = { lat, lon }; state.activeCity = cityKey;
    document.querySelectorAll('.city-option').forEach((button) => {
      const active = button.dataset.city === cityKey;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
    const city = CITIES.find((item) => item.key === cityKey);
    $('city-label').textContent = city ? city.name : 'Centro manual';
    if (updateInputs) { $('center-lat').value = lat.toFixed(5); $('center-lon').value = lon.toFixed(5); }
    if (state.centerMarker) state.centerMarker.setLatLng([lat, lon]);
    fitRadius(); render();
  }

  async function loadData() {
    if (state.loading) return;
    state.loading = true; $('data-status').textContent = 'Consultando feed en directo…';
    try {
      const params = new URLSearchParams({
        lat: String(state.center.lat), lon: String(state.center.lon), radius: String(state.radius),
        hundos: String($('only-hundos').checked),
      });
      const search = $('pokemon-filter').value.trim().replace(/^#/, '');
      if (/^\d+$/.test(search)) params.set('pokemonId', search);
      const response = await fetch(`/api/spawns?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ? `${data.error} ${data.detail}` : (data.error || `Error ${response.status}`));
      state.rawRows = (data.spawns || []).map(normalize).filter(Boolean);
      state.lastUpdated = data.generated_at;
      const count = state.rawRows.length, hundos = state.rawRows.filter((row) => row.iv === 100).length;
      $('data-status').textContent = `${count.toLocaleString('es-ES')} resultados · ${hundos} hundos`;
      document.querySelector('.live-dot').style.background = '#79bd43';
      document.querySelector('.live-dot').style.boxShadow = '0 0 0 3px #e8f5dc';
      $('stat-total').textContent = `${data.count.toLocaleString('es-ES')} resultados recibidos · ${state.radius} km`;
      $('stat-updated').textContent = fmtTime(data.generated_at);
      render();
    } catch (error) {
      $('data-status').textContent = 'Feed no disponible';
      document.querySelector('.live-dot').style.background = '#db9b4d';
      document.querySelector('.live-dot').style.boxShadow = '0 0 0 3px #f9eedc';
      $('stat-total').textContent = error.message;
      state.rawRows = []; $('stat-updated').textContent = '—'; render();
      toast(error.message);
    } finally { state.loading = false; }
  }

  function popup(row) {
    const maps = `https://maps.google.com/?q=${row.lat},${row.lon}`;
    return `<strong>${safe(row.species)}${row.iv === 100 ? ' · HUNDO 💯' : ''}</strong><br>IV ${row.iv.toFixed(2)}% · ATK ${row.atk} / DEF ${row.def} / PS ${row.sta}<br>CP ${row.cp} · Nivel ${row.level}<br>Expira en ${safe(timeLeft(row.expiresAt))}<br><code>${row.lat.toFixed(5)}, ${row.lon.toFixed(5)}</code><br><a href="${maps}" target="_blank" rel="noopener">Abrir coordenadas</a>`;
  }

  function render() {
    const query = $('pokemon-filter').value.trim().replace(/^#/, '').toLowerCase();
    const onlyHundos = $('only-hundos').checked;
    state.rows = state.rawRows.map((row) => ({ ...row, distance: distanceKm(state.center, row) }))
      .filter((row) => row.distance <= state.radius && (!onlyHundos || row.iv === 100)
        && (!query || String(row.pokemonId).includes(query) || row.species.toLowerCase().includes(query)));
    const activeCity = CITIES.find((item) => item.key === state.activeCity);
    $('radius-label').textContent = `${state.radius} km`;
    $('map-subtitle').textContent = `Radio de ${state.radius} km · ${activeCity?.name || 'centro manual'} · ${state.center.lat.toFixed(4)}, ${state.center.lon.toFixed(4)}`;
    $('stat-spawns').textContent = state.rawRows.filter((row) => distanceKm(state.center, row) <= state.radius).length.toLocaleString('es-ES');
    $('stat-hundos').textContent = state.rawRows.filter((row) => row.iv === 100 && distanceKm(state.center, row) <= state.radius).length.toLocaleString('es-ES');
    $('stat-species').textContent = new Set(state.rows.map((row) => row.pokemonId)).size.toLocaleString('es-ES');
    $('map-count').textContent = `${state.rows.length.toLocaleString('es-ES')} spawns mostrados · ${state.rawRows.filter((row) => row.iv === 100 && distanceKm(state.center, row) <= state.radius).length} hundos`;
    if (state.heat) state.heat.setLatLngs(state.rows.map((row) => [row.lat, row.lon, row.iv === 100 ? 1 : 0.45]));
    if (state.markers) {
      state.markers.clearLayers();
      state.rows.forEach((row) => {
        const hundo = row.iv === 100;
        const marker = L.circleMarker([row.lat, row.lon], { radius: hundo ? 9 : 5, color: hundo ? '#a56814' : '#176d79', weight: hundo ? 2 : 1, fillColor: hundo ? '#ffc83d' : '#54b9bd', fillOpacity: 0.9 });
        marker.bindPopup(popup(row), { maxWidth: 250 }); marker.addTo(state.markers);
      });
    }
    $('spawn-list').innerHTML = state.rows.length ? state.rows.slice().sort((a, b) => b.iv - a.iv || new Date(a.expiresAt) - new Date(b.expiresAt)).slice(0, 250).map((row) => {
      const hundo = row.iv === 100;
      return `<button class="spawn-row${hundo ? ' hundo' : ''}" data-spawn="${safe(row.id)}"><span class="spawn-sprite">${hundo ? '💯' : `#${row.pokemonId}`}</span><span class="spawn-info"><strong>${safe(row.species)}${hundo ? ' · HUNDO' : ''}</strong><small>IV ${row.iv.toFixed(2)}% · CP ${row.cp} · Nv. ${row.level}</small><small>${row.lat.toFixed(5)}, ${row.lon.toFixed(5)} · expira ${safe(timeLeft(row.expiresAt))}</small></span><span class="spawn-distance">${row.distance.toFixed(1)} km</span></button>`;
    }).join('') : `<div class="empty-state">${state.loading ? 'Consultando el feed…' : (onlyHundos ? `No hay hundos activos en este radio. El feed tiene ${state.rawRows.length} spawns activos en total.` : 'No hay spawns activos en el radio seleccionado.')}</div>`;
    $('spawn-list').querySelectorAll('[data-spawn]').forEach((button) => button.addEventListener('click', () => {
      const row = state.rows.find((item) => item.id === button.dataset.spawn); if (!row) return;
      state.map.setView([row.lat, row.lon], 16); state.markers.eachLayer((marker) => { if (marker.getLatLng().lat === row.lat && marker.getLatLng().lng === row.lon) marker.openPopup(); });
    }));
  }

  initControls(); initMap(); loadData();
  setInterval(() => {
    if (!state.loading) {
      $('stat-updated').textContent = fmtTime(state.lastUpdated);
      document.querySelectorAll('.spawn-row').forEach((item) => {
        const id = item.dataset.spawn, row = state.rows.find((entry) => entry.id === id);
        const expiry = item.querySelector('.spawn-info small:last-child');
        if (row && expiry) expiry.textContent = `${row.lat.toFixed(5)}, ${row.lon.toFixed(5)} · expira ${timeLeft(row.expiresAt)}`;
      });
    }
  }, 1000);
  setInterval(() => { if (!document.hidden) loadData(); }, 30000);
})();
