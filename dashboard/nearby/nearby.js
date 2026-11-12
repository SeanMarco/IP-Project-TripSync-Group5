(() => {
  const $ = (selector) => document.querySelector(selector);
  const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  const preview = new URLSearchParams(location.search).get('preview') === '1';

  let user = null;
  let trips = [];
  let trip = null;
  let center = null;
  let origin = null;
  let radius = 5000;
  let places = [];
  let map = null;
  let layer = null;
  let toastTimer;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad2 = (n) => String(n).padStart(2, '0');
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  function distanceKm(a, b) {
    const rad = (x) => (x * Math.PI) / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }

  function howFar(km) {
    if (km < 1) return `${Math.round(km * 1000)} m · ~${Math.max(1, Math.round((km / 5) * 60))} min walk`;
    if (km <= 2.5) return `${km.toFixed(1)} km · ~${Math.round((km / 5) * 60)} min walk`;
    return `${km.toFixed(1)} km · ~${Math.round((km / 25) * 60) + 5} min ride`;
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function setUserName(name) {
    const parts = name.trim().split(/\s+/);
    $('#top-name').textContent = parts[0];
    $('#top-avatar').textContent = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
  }

  async function init() {
    if (!client) return showToast('Supabase config was not loaded.');
    const { data } = await client.auth.getSession();
    if (!data.session) {
      if (!preview) location.replace('../../index/index.html');
      return renderEmpty();
    }
    user = data.session.user;
    const meta = user.user_metadata || {};
    setUserName([meta.first_name, meta.last_name].filter(Boolean).join(' ') || user.email.split('@')[0]);

    const { data: rows, error } = await client.from('trips').select('*').order('start_date', { ascending: true });
    if (error) return showToast(error.message);
    trips = rows;
    if (!trips.length) return renderEmpty();

    const today = todayStr();
    const wanted = new URLSearchParams(location.search).get('trip');
    const first = trips.find((t) => t.id === wanted)
      || trips.find((t) => t.start_date <= today && t.end_date >= today)
      || trips.find((t) => t.end_date >= today)
      || trips[trips.length - 1];
    $('#trip-select').innerHTML = trips.map((t) => `<option value="${esc(t.id)}">${esc(t.title)} · ${esc(t.destination)}</option>`).join('');
    selectTrip(first.id);
  }

  function renderEmpty() {
    $('#stay-panel').hidden = true;
    $('#near-map').hidden = true;
    $('#trip-select').hidden = true;
    $('#near-grid').innerHTML = '<div class="empty-note"><strong>No trips yet</strong>Plan a trip first, then come here to find places to visit.<br><a class="text-link" href="../trips/trips.html">Go to My trips →</a></div>';
  }

  async function selectTrip(id) {
    trip = trips.find((t) => t.id === id);
    $('#trip-select').value = id;
    history.replaceState(null, '', `?trip=${encodeURIComponent(id)}`);
    $('#near-summary').textContent = `Places worth visiting around ${[trip.destination, trip.country].filter(Boolean).join(', ')}.`;
    $('#stay-input').value = '';
    $('#stay-results').hidden = true;

    const place = trip.latitude != null ? { lat: trip.latitude, lng: trip.longitude } : await TravelAPI.geocode(trip.destination, trip.country || '');
    center = place ? { type: 'center', lat: place.lat, lng: place.lng, label: `${trip.destination} city center` } : null;
    const stay = stayOrigin();
    if (!center && !stay) {
      $('#origin-label').textContent = `Couldn't find ${trip.destination} on the map`;
      $('#near-grid').innerHTML = '<div class="empty-note"><strong>Location not found</strong>Type where you\'re staying above to search around it.</div>';
      return renderStay();
    }
    origin = stay || center;
    renderStay();
    loadPlaces();
  }

  function stayOrigin() {
    return trip.stay_lat != null ? { type: 'stay', lat: trip.stay_lat, lng: trip.stay_lng, label: trip.stay_name } : null;
  }

  function renderStay() {
    $('#origin-label').textContent = origin ? origin.label : '—';
    $('#origin-stay').disabled = trip.stay_lat == null;
    $('#stay-clear').hidden = trip.stay_lat == null;
    document.querySelectorAll('#origin-chips button').forEach((b) => b.classList.toggle('active', b.dataset.origin === origin?.type));
  }

  async function loadPlaces() {
    $('#near-count').textContent = 'Finding places…';
    $('#near-grid').innerHTML = '<div class="empty-note">Looking around…</div>';
    const found = await TravelAPI.nearby(origin.lat, origin.lng, radius);
    if (!found) {
      $('#near-count').textContent = 'Places nearby';
      $('#near-grid').innerHTML = '<div class="empty-note"><strong>Couldn\'t load places</strong>Check your connection and try again.</div>';
      return drawMap();
    }
    places = found.map((p) => ({ ...p, km: distanceKm(origin, p) })).sort((a, b) => a.km - b.km);
    $('#near-count').textContent = `${places.length} place${places.length === 1 ? '' : 's'} within ${radius / 1000} km`;
    $('#near-grid').innerHTML = places.length
      ? places.map((p, i) => `
        <article class="near-card">
          <div class="near-photo${p.photo ? '' : ' photo-fallback'}"${p.photo ? ` style="background-image:url('${esc(p.photo)}')"` : ''}><span class="near-no">${i + 1}</span></div>
          <div class="near-body">
            <strong>${esc(p.name)}</strong>
            ${p.description ? `<span class="near-desc">${esc(p.description)}</span>` : ''}
            <span class="near-dist">${howFar(p.km)}</span>
          </div>
          <div class="near-actions">
            <a class="ghost-button" href="https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">Directions ↗</a>
            <button class="ghost-button" type="button" data-add="${p.id}">＋ Itinerary</button>
            <a class="near-wiki" href="${esc(p.url)}" target="_blank" rel="noopener" aria-label="Read about ${esc(p.name)} on Wikipedia">W</a>
          </div>
        </article>`).join('')
      : `<div class="empty-note"><strong>No well-known places within ${radius / 1000} km</strong>Try a bigger distance.</div>`;
    drawMap();
  }

  function drawMap() {
    if (typeof L === 'undefined') return ($('#near-map').hidden = true);
    if (!map) {
      map = L.map('near-map', { scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
      layer = L.layerGroup().addTo(map);
    }
    layer.clearLayers();
    L.circleMarker([origin.lat, origin.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#eb2f33', fillOpacity: 1 })
      .bindPopup(`<b>${esc(origin.label)}</b>`).addTo(layer);
    places.forEach((p, i) => {
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'near-pin', html: `<span>${i + 1}</span>`, iconSize: [26, 26] }) })
        .bindPopup(`<b>${esc(p.name)}</b><br>${howFar(p.km)}`).addTo(layer);
    });
    const points = [[origin.lat, origin.lng], ...places.map((p) => [p.lat, p.lng])];
    if (points.length > 1) map.fitBounds(points, { padding: [30, 30], maxZoom: 15 });
    else map.setView(points[0], 14);
    setTimeout(() => map.invalidateSize(), 0);
  }

  async function addToItinerary(place) {
    const today = todayStr();
    const date = today >= trip.start_date && today <= trip.end_date ? today : trip.start_date;
    const { error } = await client.from('itinerary_items').insert({
      user_id: user.id, trip_id: trip.id, title: `Visit ${place.name}`, item_date: date, item_time: null, tag: 'Activity'
    });
    if (error) return showToast(error.message);
    showToast(`Added "${place.name}" to your itinerary.`);
    const button = document.querySelector(`[data-add="${place.id}"]`);
    if (button) {
      button.textContent = '✓ Added';
      button.disabled = true;
    }
  }

  async function findStay(event) {
    event.preventDefault();
    const q = $('#stay-input').value.trim();
    if (!q) return $('#stay-input').focus();
    const query = q.toLowerCase().includes(trip.destination.toLowerCase()) ? q : `${q}, ${trip.destination}`;
    $('#stay-search').disabled = true;
    const results = await TravelAPI.findPlace(query);
    $('#stay-search').disabled = false;
    const box = $('#stay-results');
    box.hidden = false;
    box.innerHTML = results?.length
      ? results.map((r, i) => `<button type="button" data-pick="${i}">${esc(r.name)}</button>`).join('')
      : '<p>No matches. Try the hotel name plus the street or area.</p>';
    box.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => saveStay(results[Number(b.dataset.pick)])));
  }

  async function saveStay(place) {
    const name = place.name.split(',').slice(0, 2).join(',').trim();
    const fields = { stay_name: name, stay_lat: place.lat, stay_lng: place.lng };
    const { error } = await client.from('trips').update(fields).eq('id', trip.id);
    if (error) return showToast(error.message.includes('stay_') ? 'Run the "stay" SQL in Supabase first.' : error.message);
    Object.assign(trip, fields);
    $('#stay-results').hidden = true;
    $('#stay-input').value = '';
    origin = stayOrigin();
    renderStay();
    showToast('Saved where you\'re staying.');
    loadPlaces();
  }

  async function clearStay() {
    const fields = { stay_name: null, stay_lat: null, stay_lng: null };
    const { error } = await client.from('trips').update(fields).eq('id', trip.id);
    if (error) return showToast(error.message);
    Object.assign(trip, fields);
    if (origin?.type === 'stay') origin = center;
    renderStay();
    if (origin) loadPlaces();
  }

  function useMyLocation() {
    if (!navigator.geolocation) return showToast('Your browser can\'t share its location.');
    showToast('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        origin = { type: 'me', lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Your current location' };
        renderStay();
        loadPlaces();
      },
      () => showToast('Location access was blocked. Allow it in your browser, or set your stay instead.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#theme-toggle').addEventListener('click', () => {
      const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('theme', theme);
    });
    $('#logout-button').addEventListener('click', async () => {
      await client?.auth.signOut();
      location.href = '../../index/index.html';
    });

    $('#trip-select').addEventListener('change', (event) => selectTrip(event.target.value));
    $('#stay-form').addEventListener('submit', findStay);
    $('#stay-clear').addEventListener('click', clearStay);
    $('#origin-chips').addEventListener('click', (event) => {
      const button = event.target.closest('[data-origin]');
      if (!button || button.disabled) return;
      if (button.dataset.origin === 'me') return useMyLocation();
      origin = button.dataset.origin === 'stay' ? stayOrigin() : center;
      if (!origin) return;
      renderStay();
      loadPlaces();
    });
    $('#radius-chips').addEventListener('click', (event) => {
      const button = event.target.closest('[data-radius]');
      if (!button || !origin) return;
      radius = Number(button.dataset.radius);
      document.querySelectorAll('#radius-chips button').forEach((b) => b.classList.toggle('active', b === button));
      loadPlaces();
    });
    $('#near-grid').addEventListener('click', (event) => {
      const add = event.target.closest('[data-add]');
      if (add) addToItinerary(places.find((p) => String(p.id) === add.dataset.add));
    });

    init();
  });
})();