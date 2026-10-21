(() => {
  const CITIES = [
    { key: 'valencia', name: 'Valencia', lat: 39.4699, lon: -0.3763 },
    { key: 'zaragoza', name: 'Zaragoza', lat: 41.65624, lon: -0.8788 },
  ];
  const RADII = [5, 10, 25, 50, 100, 150, 200, 250, 300];
  const HOME = CITIES[0];
  const state = {
    center: { lat: HOME.lat, lon: HOME.lon }, activeCity: HOME.key, resetCity: HOME.key, radius: 25,
    rawRows: [], rows: [], map: null, heat: null, markers: null, centerMarker: null, radiusCircle: null,
    lastUpdated: null, loading: false, reloadQueued: false, searchIds: [], globalHundos: true, sortMode: 'distance',
  };
  const shiny = { layer: null, on: false, loading: false };
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
  const toast = (message) => { const el = $('toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3500); };
  const searchTerms = (value) => value.split(/[,;\n]+/).map((term) => term.trim()).filter(Boolean);

  async function resolvePokemonId(value) {
    const term = value.trim().replace(/^#/, '');
    if (/^\d+$/.test(term)) return Number(term);
    let slug = term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    slug = slug.replace(/♀/g, '-f').replace(/♂/g, '-m').replace(/[’']/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!slug) throw new Error('Escribe un nombre o número de Pokédex.');
    const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(slug)}`);
    if (!response.ok) throw new Error(`No encuentro “${term}” en la Pokédex. Prueba con su nombre inglés o número.`);
    const pokemon = await response.json();
    if (!Number.isInteger(pokemon.id)) throw new Error(`No encuentro “${term}” en la Pokédex.`);
    return pokemon.id;
  }

  function normalize(row) {
    const lat = num(row.lat), lon = num(row.lng), id = Number(row.dex);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const rawDespawn = row.despawn;
    return {
      id: String(row.id ?? `${id}-${lat}-${lon}-${rawDespawn}`), pokemonId: id, species: speciesName(id, row.name), lat, lon,
      cp: Number(row.cp) || 0, level: Number(row.level) || 0, iv: Number(row.iv) || 0,
      atk: Number(row.attack) || 0, def: Number(row.defense) || 0, sta: Number(row.stamina) || 0,
      original: row,
    };
  }

  function initControls() {
    $('minimum-level').addEventListener('input', () => {
      const level = Number($('minimum-level').value);
      $('minimum-level-value').textContent = level ? `Nivel ${level}+` : 'Cualquier nivel';
    });
    $('minimum-level').addEventListener('change', loadData);
    $('radius-range').max = String(RADII.length - 1);
    $('radius-range').value = String(Math.max(0, RADII.indexOf(state.radius)));
    $('radius-range').addEventListener('input', () => {
      state.radius = RADII[Number($('radius-range').value)];
      $('radius-label').textContent = `${state.radius} km`;
      $('radius-range').setAttribute('aria-valuetext', `${state.radius} kilómetros`);
      fitRadius(); render();
    });
    $('radius-range').addEventListener('change', loadData);
    document.querySelectorAll('.sort-option').forEach((button) => button.addEventListener('click', () => {
      state.sortMode = button.dataset.sort;
      render();
    }));
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
    $('shiny-toggle').addEventListener('click', toggleShinies);
    $('search-submit').addEventListener('click', loadData);
    $('only-hundos').addEventListener('change', loadData);
    $('pokemon-filter').addEventListener('input', () => {
      const hasSearch = searchTerms($('pokemon-filter').value).length > 0;
      $('only-hundos').checked = !hasSearch;
      state.searchIds = []; state.globalHundos = !hasSearch; render();
    });
    $('pokemon-filter').addEventListener('keydown', (event) => { if (event.key === 'Enter') loadData(); });
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
    shiny.layer = L.layerGroup();
    if (L.heatLayer) state.heat = L.heatLayer([], { radius: 22, blur: 18, maxZoom: 16, minOpacity: 0.22, gradient: { 0.2: '#b5e7e7', 0.45: '#80d0a5', 0.7: '#ffd267', 1: '#ed704c' } }).addTo(state.map);
    fitRadius(); setTimeout(() => state.map.invalidateSize(), 100);
  }

  function fitRadius() {
    if (!state.map || !state.radiusCircle) return;
    state.radiusCircle.setLatLng([state.center.lat, state.center.lon]);
    state.radiusCircle.setRadius(state.radius * 1000);
    const globalHundos = state.globalHundos;
    state.radiusCircle.setStyle({ opacity: globalHundos ? 0 : 1, fillOpacity: globalHundos ? 0 : 0.035 });
    state.centerMarker?.setOpacity(globalHundos ? 0 : 1);
    if (!globalHundos) state.map.fitBounds(state.radiusCircle.getBounds(), { padding: [18, 18], maxZoom: 13 });
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
    if (state.loading) { state.reloadQueued = true; return; }
    state.loading = true; $('data-status').textContent = 'Consultando feed en directo…';
    $('search-submit').disabled = true;
    $('search-submit').textContent = 'Buscando…';
    try {
      const params = new URLSearchParams({
        lat: String(state.center.lat), lon: String(state.center.lon), radius: String(state.radius),
        hundos: String($('only-hundos').checked),
      });
      const terms = searchTerms($('pokemon-filter').value);
      state.globalHundos = terms.length === 0;
      if (state.globalHundos) $('only-hundos').checked = true;
      state.searchIds = [];
      if (terms.length) {
        $('search-submit').disabled = true;
        $('search-submit').textContent = 'Buscando Pokémon…';
        state.searchIds = [...new Set(await Promise.all(terms.map(resolvePokemonId)))];
        params.set('pokemonIds', state.searchIds.join(','));
        params.set('minLevel', $('minimum-level').value);
      }
      params.set('hundos', String(state.globalHundos || $('only-hundos').checked));
      const response = await fetch(`/api/spawns?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ? `${data.error} ${data.detail}` : (data.error || `Error ${response.status}`));
      state.rawRows = (data.spawns || []).map(normalize).filter(Boolean);
      state.lastUpdated = data.generated_at;
      const count = state.rawRows.length, hundos = state.rawRows.filter((row) => row.iv === 100).length;
      $('data-status').textContent = `${count.toLocaleString('es-ES')} resultados · ${hundos} hundos`;
      document.querySelector('.live-dot').style.background = '#79bd43';
      document.querySelector('.live-dot').style.boxShadow = '0 0 0 3px #e8f5dc';
      $('stat-total').textContent = state.globalHundos ? `${data.count.toLocaleString('es-ES')} hundos globales` : `${data.count.toLocaleString('es-ES')} resultados · hasta ${state.radius} km`;
      $('stat-updated').textContent = fmtTime(data.generated_at);
      $('search-submit').textContent = 'Buscar / actualizar';
      $('search-submit').disabled = false;
      render();
      toast(`Búsqueda actualizada: ${count} resultados.`);
    } catch (error) {
      $('data-status').textContent = 'Feed no disponible';
      document.querySelector('.live-dot').style.background = '#db9b4d';
      document.querySelector('.live-dot').style.boxShadow = '0 0 0 3px #f9eedc';
      $('stat-total').textContent = error.message;
      state.rawRows = []; $('stat-updated').textContent = '—'; render();
      $('search-submit').textContent = 'Reintentar búsqueda';
      $('search-submit').disabled = false;
      toast(error.message);
    } finally {
      state.loading = false;
      if (state.reloadQueued) { state.reloadQueued = false; loadData(); }
    }
  }

  function popup(row) {
    const maps = `https://maps.google.com/?q=${row.lat},${row.lon}`;
    return `<strong>${safe(row.species)}${row.iv === 100 ? ' · HUNDO 💯' : ''}</strong><br>IV ${row.iv.toFixed(2)}% · ATK ${row.atk} / DEF ${row.def} / PS ${row.sta}<br>CP ${row.cp} · Nivel ${row.level}<br><code>${row.lat.toFixed(5)}, ${row.lon.toFixed(5)}</code><br><a href="${maps}" target="_blank" rel="noopener">Abrir coordenadas</a>`;
  }

  const minutesLeft = (value) => Math.round((new Date(value).getTime() - Date.now()) / 60000);

  function shinyPopup(card) {
    const iv = card.iv && typeof card.iv === 'object' ? card.iv : {};
    const total = Number(iv.attack) + Number(iv.defense) + Number(iv.stamina);
    const pct = Number.isFinite(total) ? `${Math.round(total / 45 * 100)}%` : '—';
    const maps = `https://maps.google.com/?q=${card.latitude},${card.longitude}`;
    return `<strong>${safe(card.name)}${card.form ? ` (${safe(card.form)})` : ''} · SHINY ✨</strong><br>IV ${pct} · ATK ${safe(iv.attack)} / DEF ${safe(iv.defense)} / PS ${safe(iv.stamina)}<br>CP ${safe(card.cp)} · Nivel ${safe(card.level)}<br>${safe(card.location)} · quedan ${minutesLeft(card.expiresAt)} min<br><code>${num(card.latitude).toFixed(5)}, ${num(card.longitude).toFixed(5)}</code><br><a href="${maps}" target="_blank" rel="noopener">Abrir coordenadas</a>`;
  }

  async function loadShinies() {
    if (shiny.loading || !state.map) return;
    shiny.loading = true; $('shiny-toggle').disabled = true;
    try {
      const response = await fetch('/api/shiny?radius=25', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ? `${data.error} ${data.detail}` : (data.error || `Error ${response.status}`));
      // El radar también devuelve shinys que ya han desaparecido: se descartan.
      const cards = (data.cards || []).filter((card) => card.latitude != null && card.longitude != null
        && Number.isFinite(num(card.latitude)) && Number.isFinite(num(card.longitude)) && minutesLeft(card.expiresAt) > 0);
      shiny.layer.clearLayers();
      cards.forEach((card) => {
        L.circleMarker([num(card.latitude), num(card.longitude)], { radius: 10, color: '#49268a', weight: 2, fillColor: '#f06ac0', fillOpacity: 0.95 })
          .bindPopup(shinyPopup(card), { maxWidth: 250 }).addTo(shiny.layer);
      });
      $('shiny-note').textContent = `${cards.length} shinys activos · cuenta activa del radar · ${fmtTime(data.generated_at)}`;
      if (cards.length && !shiny.fitted) {
        shiny.fitted = true;
        state.map.fitBounds(L.latLngBounds(cards.map((card) => [num(card.latitude), num(card.longitude)])), { padding: [25, 25], maxZoom: 5 });
      }
    } catch (error) {
      $('shiny-note').textContent = error.message;
      toast(error.message);
    } finally {
      shiny.loading = false; $('shiny-toggle').disabled = false;
    }
  }

  function toggleShinies() {
    if (!state.map) return;
    shiny.on = !shiny.on;
    $('shiny-toggle').textContent = shiny.on ? 'Ocultar shinys' : 'Mostrar shinys';
    $('shiny-toggle').setAttribute('aria-pressed', String(shiny.on));
    if (shiny.on) { shiny.layer.addTo(state.map); loadShinies(); return; }
    state.map.removeLayer(shiny.layer); shiny.fitted = false;
    $('shiny-note').textContent = 'Shinys del Shiny Radar, de la cuenta activa. Son globales.';
  }

  function render() {
    const queries = searchTerms($('pokemon-filter').value).map((term) => term.replace(/^#/, '').toLowerCase());
    const globalHundos = searchTerms($('pokemon-filter').value).length === 0;
    state.globalHundos = globalHundos;
    if (globalHundos) $('only-hundos').checked = true;
    const onlyHundos = globalHundos || $('only-hundos').checked;
    const minimumLevel = Number($('minimum-level').value) || 0;
    document.querySelectorAll('.sort-option').forEach((button) => {
      const active = button.dataset.sort === state.sortMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    document.body.classList.toggle('global-search', globalHundos);
    document.querySelector('.city-section').hidden = globalHundos;
    document.querySelector('.center-section').hidden = globalHundos;
    document.querySelector('.radius-legend').hidden = globalHundos;
    state.rows = state.rawRows.map((row) => ({ ...row, distance: distanceKm(state.center, row) }))
      .filter((row) => (globalHundos || row.distance <= state.radius) && (!onlyHundos || row.iv === 100)
        && (globalHundos || row.level >= minimumLevel)
        && (!queries.length || queries.some((query) => String(row.pokemonId).includes(query) || row.species.toLowerCase().includes(query) || state.searchIds.includes(row.pokemonId))));
    const activeCity = CITIES.find((item) => item.key === state.activeCity);
    $('only-hundos').disabled = globalHundos;
    $('radius-label').textContent = globalHundos ? 'Global' : `${state.radius} km`;
    $('radius-options').classList.toggle('disabled', globalHundos);
    $('radius-range').disabled = globalHundos;
    $('radius-note').textContent = globalHundos ? 'La búsqueda inicial de hundos es global.' : 'Radio aplicado a la búsqueda por Pokémon (hasta 300 km).';
    $('search-note').textContent = globalHundos ? 'Hundos globales. Escribe Pokémon para buscar en tu radio.' : `Varios nombres con comas · Nivel mínimo: ${minimumLevel || 'cualquiera'}.`;
    $('map-subtitle').textContent = globalHundos ? `Hundos globales · ${state.rows.length} resultados recibidos` : `${onlyHundos ? 'Solo 100% IV · ' : ''}Radio de ${state.radius} km · ${activeCity?.name || 'centro manual'} · ${state.center.lat.toFixed(4)}, ${state.center.lon.toFixed(4)}`;
    $('stat-spawns-label').textContent = globalHundos ? 'HUNDOS GLOBALES' : (onlyHundos ? 'HUNDOS EN EL RADIO' : 'SPAWNS EN EL RADIO');
    $('stat-species-note').textContent = globalHundos ? 'En resultados globales' : 'En el radio seleccionado';
    const visibleHundos = state.rows.filter((row) => row.iv === 100).length;
    $('stat-spawns').textContent = onlyHundos ? visibleHundos.toLocaleString('es-ES') : state.rows.length.toLocaleString('es-ES');
    $('stat-hundos').textContent = globalHundos ? visibleHundos.toLocaleString('es-ES') : state.rawRows.filter((row) => row.iv === 100 && distanceKm(state.center, row) <= state.radius).length.toLocaleString('es-ES');
    $('stat-total').textContent = globalHundos ? `${state.rawRows.length.toLocaleString('es-ES')} hundos globales` : `${state.rawRows.length.toLocaleString('es-ES')} resultados recibidos · ${state.radius} km`;
    $('stat-species').textContent = new Set(state.rows.map((row) => row.pokemonId)).size.toLocaleString('es-ES');
    $('map-count').textContent = globalHundos ? `${visibleHundos} hundos globales` : `${state.rows.length.toLocaleString('es-ES')} spawns mostrados · ${state.rawRows.filter((row) => row.iv === 100 && distanceKm(state.center, row) <= state.radius).length} hundos`;
    if (state.radiusCircle) state.radiusCircle.setStyle({ opacity: globalHundos ? 0 : 1, fillOpacity: globalHundos ? 0 : 0.035 });
    if (state.centerMarker) state.centerMarker.setOpacity(globalHundos ? 0 : 1);
    if (state.heat) state.heat.setLatLngs(state.rows.map((row) => [row.lat, row.lon, row.iv === 100 ? 1 : 0.45]));
    if (state.markers) {
      state.markers.clearLayers();
      state.rows.forEach((row) => {
        const hundo = row.iv === 100;
        const marker = L.circleMarker([row.lat, row.lon], { radius: hundo ? 9 : 5, color: hundo ? '#a56814' : '#176d79', weight: hundo ? 2 : 1, fillColor: hundo ? '#ffc83d' : '#54b9bd', fillOpacity: 0.9 });
        marker.bindPopup(popup(row), { maxWidth: 250 }); marker.addTo(state.markers);
      });
    }
    const sortedRows = state.rows.slice().sort((a, b) => state.sortMode === 'level'
      ? b.level - a.level || a.distance - b.distance || b.iv - a.iv
      : a.distance - b.distance || b.level - a.level || b.iv - a.iv);
    $('spawn-list').innerHTML = state.rows.length ? sortedRows.slice(0, 250).map((row) => {
      const hundo = row.iv === 100;
      return `<button class="spawn-row${hundo ? ' hundo' : ''}" data-spawn="${safe(row.id)}"><span class="spawn-sprite">${hundo ? '💯' : `#${row.pokemonId}`}</span><span class="spawn-info"><strong>${safe(row.species)}${hundo ? ' · HUNDO' : ''}</strong><small>IV ${row.iv.toFixed(2)}% · CP ${row.cp} · Nv. ${row.level}</small><small>${row.lat.toFixed(5)}, ${row.lon.toFixed(5)}</small></span><span class="spawn-distance">${onlyHundos ? 'Global' : `${row.distance.toFixed(1)} km`}</span></button>`;
    }).join('') : `<div class="empty-state">${state.loading ? 'Consultando el feed…' : (onlyHundos ? 'PokéCoords no devolvió hundos globales en esta consulta.' : 'No hay spawns en el radio seleccionado.')}</div>`;
    if (globalHundos && state.rows.length && state.map) {
      const bounds = L.latLngBounds(state.rows.map((row) => [row.lat, row.lon]));
      state.map.fitBounds(bounds, { padding: [25, 25], maxZoom: 5 });
    }
    $('spawn-list').querySelectorAll('[data-spawn]').forEach((button) => button.addEventListener('click', () => {
      const row = state.rows.find((item) => item.id === button.dataset.spawn); if (!row) return;
      state.map.setView([row.lat, row.lon], 16); state.markers.eachLayer((marker) => { if (marker.getLatLng().lat === row.lat && marker.getLatLng().lng === row.lon) marker.openPopup(); });
    }));
  }

  initControls(); initMap(); loadData();
  setInterval(() => { if (!document.hidden) { loadData(); if (shiny.on) loadShinies(); } }, 30000);
})();
