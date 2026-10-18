(() => {
  const HOME = { lat: 39.4699, lon: -0.3763 };
  const RADII = [5, 10, 25, 50, 100];
  const FIELD = {
    lat: 'latitude', lon: 'longitude', species: 'species', time: 'timestamp', name: 'name',
  };
  const ZONES = [
    { name: 'Valencia centro', lat: 39.4699, lon: -0.3763 },
    { name: 'Ruzafa', lat: 39.4627, lon: -0.3731 },
    { name: 'Cabanyal', lat: 39.4653, lon: -0.3338 },
    { name: 'Malvarrosa', lat: 39.4808, lon: -0.3231 },
    { name: 'Turia', lat: 39.4750, lon: -0.3750 },
    { name: 'Bioparc', lat: 39.4783, lon: -0.4072 },
    { name: 'Albufera', lat: 39.3317, lon: -0.3317 },
    { name: 'Port Saplaya', lat: 39.5250, lon: -0.3177 },
    { name: 'Sagunto', lat: 39.6833, lon: -0.2667 },
    { name: 'Gandía', lat: 38.9667, lon: -0.1833 },
    { name: 'Xàtiva', lat: 38.9900, lon: -0.5183 },
    { name: 'Castellón', lat: 39.9860, lon: -0.0494 },
    { name: 'Requena', lat: 39.4880, lon: -1.1000 },
  ];
  const state = { center: { ...HOME }, radius: 100, rawRows: [], rows: [], map: null, heat: null, centerMarker: null, maxCircle: null, radiusCircle: null };
  const $ = (id) => document.getElementById(id);
  const num = (v) => typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  const haversine = (a, b) => {
    const rad = (d) => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const getValue = (row, key, fallback) => row[key] ?? row[fallback] ?? '';
  const toast = (message) => { const el = $('toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); };

  function normalize(row) {
    const lat = num(getValue(row, FIELD.lat, 'lat'));
    const lon = num(getValue(row, FIELD.lon, 'lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const rawTime = getValue(row, FIELD.time, 'created_on');
    const date = rawTime ? new Date(rawTime) : null;
    const speciesValue = getValue(row, FIELD.species, 'pokemon');
    return {
      lat, lon, species: String(typeof speciesValue === 'object' ? (speciesValue.value ?? speciesValue.name ?? '') : speciesValue || 'Sin especie'),
      timestamp: date && !Number.isNaN(date.getTime()) ? date : null,
      name: String(getValue(row, FIELD.name, 'title') || speciesValue || 'Spawn'), original: row,
    };
  }

  function initControls() {
    $('radius-options').innerHTML = RADII.map((r) => `<button class="radius-option${r === state.radius ? ' active' : ''}" data-radius="${r}" aria-pressed="${r === state.radius}">${r}</button>`).join('');
    $('radius-options').addEventListener('click', (event) => {
      const button = event.target.closest('[data-radius]'); if (!button) return;
      state.radius = Number(button.dataset.radius);
      document.querySelectorAll('.radius-option').forEach((b) => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
      $('radius-label').textContent = `${state.radius} km`; render();
    });
    $('zone-list').innerHTML = ZONES.map((z, i) => `<button class="zone-chip" data-zone="${i}">${safe(z.name)}</button>`).join('');
    $('zone-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-zone]'); if (!button) return;
      const zone = ZONES[Number(button.dataset.zone)]; setCenter(zone.lat, zone.lon); $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('apply-center').addEventListener('click', () => {
      const lat = num($('center-lat').value), lon = num($('center-lon').value);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return toast('Introduce una latitud y longitud válidas.');
      setCenter(lat, lon);
    });
    $('reset-center').addEventListener('click', () => setCenter(HOME.lat, HOME.lon));
    $('refresh').addEventListener('click', loadData);
  }

  function initMap() {
    if (!window.L) { $('data-status').textContent = 'No se pudo cargar el mapa'; return; }
    state.map = L.map('map', { zoomControl: true }).setView([state.center.lat, state.center.lon], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(state.map);
    state.maxCircle = L.circle([state.center.lat, state.center.lon], { radius: 100000, color: '#789566', weight: 1.5, dashArray: '5 6', fillColor: '#a5e865', fillOpacity: 0.035, interactive: false }).addTo(state.map);
    state.radiusCircle = L.circle([state.center.lat, state.center.lon], { radius: state.radius * 1000, color: '#85b755', weight: 1, fillColor: '#a5e865', fillOpacity: 0.08, interactive: false }).addTo(state.map);
    state.centerMarker = L.marker([state.center.lat, state.center.lon], { icon: L.divIcon({ className: '', html: '<span class="center-marker"></span>', iconSize: [14, 14], iconAnchor: [7, 7] }), draggable: true }).addTo(state.map).bindTooltip('Centro de análisis');
    state.centerMarker.on('dragend', () => { const p = state.centerMarker.getLatLng(); setCenter(p.lat, p.lng, false); });
    state.map.on('click', (event) => setCenter(event.latlng.lat, event.latlng.lng));
    if (L.heatLayer) state.heat = L.heatLayer([], { radius: 22, blur: 18, maxZoom: 16, minOpacity: 0.27, gradient: { 0.2: '#b5e7e7', 0.45: '#80d0a5', 0.7: '#ffd267', 1: '#ed704c' } }).addTo(state.map);
    setTimeout(() => state.map.invalidateSize(), 100);
  }

  function setCenter(lat, lon, updateInputs = true) {
    state.center = { lat, lon };
    if (updateInputs) { $('center-lat').value = lat.toFixed(4); $('center-lon').value = lon.toFixed(4); }
    if (state.centerMarker) state.centerMarker.setLatLng([lat, lon]);
    if (state.maxCircle) state.maxCircle.setLatLng([lat, lon]);
    if (state.radiusCircle) state.radiusCircle.setLatLng([lat, lon]);
    if (state.map) state.map.setView([lat, lon], state.map.getZoom());
    render();
  }

  async function loadData() {
    $('data-status').textContent = 'Leyendo Baserow…';
    try {
      const response = await fetch('/api/spawns', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
      Object.assign(FIELD, data.fields || {});
      state.rawRows = data.rows.map(normalize).filter(Boolean);
      $('data-status').textContent = `${state.rawRows.length.toLocaleString('es-ES')} ubicaciones válidas`;
      document.querySelector('.live-dot').style.background = '#79bd43';
      document.querySelector('.live-dot').style.boxShadow = '0 0 0 3px #e8f5dc';
      render();
    } catch (error) {
      $('data-status').textContent = 'Baserow sin configurar';
      document.querySelector('.live-dot').style.background = '#db9b4d';
      $('stat-total').textContent = error.message;
      $('ranking-list').innerHTML = `<div class="empty-state">${safe(error.message)}<br><br>Configura las variables de entorno indicadas en README.md.</div>`;
      $('stat-spawns').textContent = '—'; $('stat-species').textContent = '—'; $('stat-peak').textContent = '—'; $('stat-leader').textContent = '—';
      if (state.heat) state.heat.setLatLngs([]);
    }
  }

  function rankZones(rows) {
    const metrics = ZONES.map((zone) => {
      const selected = rows.filter((row) => haversine(zone, row) <= 1.5);
      const species = new Set(selected.map((r) => r.species).filter((s) => s && s !== 'Sin especie'));
      const hours = new Set(selected.filter((r) => r.timestamp).map((r) => r.timestamp.getHours()));
      return { zone, count: selected.length, diversity: species.size, hours: hours.size };
    }).filter((x) => haversine(state.center, x.zone) <= state.radius && (x.count || x.diversity));
    const maxCount = Math.max(1, ...metrics.map((m) => m.count));
    const maxSpecies = Math.max(1, ...metrics.map((m) => m.diversity));
    const maxHours = Math.max(1, ...metrics.map((m) => m.hours));
    return metrics.map((m) => ({ ...m, score: Math.round(100 * ((m.count / maxCount + m.diversity / maxSpecies + m.hours / maxHours) / 3)) })).sort((a, b) => b.score - a.score || b.count - a.count);
  }

  function render() {
    state.rows = state.rawRows.map((row) => ({ ...row, distance: haversine(state.center, row) })).filter((row) => row.distance <= Math.min(state.radius, 100));
    $('radius-label').textContent = `${state.radius} km`;
    $('map-subtitle').textContent = `Radio de ${state.radius} km · centro ${state.center.lat.toFixed(4)}, ${state.center.lon.toFixed(4)}`;
    $('stat-spawns').textContent = state.rows.length.toLocaleString('es-ES');
    $('stat-total').textContent = `${state.rawRows.length.toLocaleString('es-ES')} registros con coordenadas válidas`;
    const species = new Set(state.rows.map((r) => r.species).filter((s) => s && s !== 'Sin especie'));
    $('stat-species').textContent = species.size.toLocaleString('es-ES');
    const hours = Array(24).fill(0);
    state.rows.forEach((row) => { if (row.timestamp) hours[row.timestamp.getHours()] += 1; });
    const peakHour = hours.indexOf(Math.max(...hours));
    $('stat-peak').textContent = state.rows.some((r) => r.timestamp) ? `${String(peakHour).padStart(2, '0')}:00` : '—';
    $('stat-peak-note').textContent = state.rows.some((r) => r.timestamp) ? `${hours[peakHour]} registros · hora local del navegador` : 'No hay marcas de tiempo disponibles';
    const ranking = rankZones(state.rows);
    $('stat-leader').textContent = ranking[0]?.zone.name || '—';
    $('ranking-list').innerHTML = ranking.length ? ranking.slice(0, 8).map((m, i) => `<div class="ranking-row"><span class="zone-name">${String(i + 1).padStart(2, '0')} &nbsp;${safe(m.zone.name)}</span><span>${m.count}</span><span>${m.diversity}</span><span class="rank-score">${m.score}</span></div>`).join('') : '<div class="empty-state">No hay zonas con registros en este radio.</div>';
    $('hour-chart').innerHTML = hours.some((v) => v) ? hours.map((v, h) => `<div class="hour-bar${h === peakHour ? ' peak' : ''}" title="${String(h).padStart(2, '0')}:00 · ${v} registros" style="height:${Math.max(3, v / Math.max(1, ...hours) * 52)}px"></div>`).join('') : '<div class="empty-state">Sin datos horarios todavía</div>';
    $('map-count').textContent = `${state.rows.length.toLocaleString('es-ES')} puntos dentro del radio`;
    if (state.radiusCircle) state.radiusCircle.setRadius(state.radius * 1000);
    if (state.heat) state.heat.setLatLngs(state.rows.map((r) => [r.lat, r.lon, 0.65]));
  }

  initControls(); initMap(); loadData();
})();
