(() => {
  const $ = (selector) => document.querySelector(selector);

  $('#theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  });
  const toast = $('#toast');
  let toastTimer;

  const state = {
    client: null,
    user: null,
    trips: [],
    saved: [],
    destinations: [],
    expenses: [],
    itinerary: [],
    checklist: [],
    featured: null,
    selectedId: new URLSearchParams(location.search).get('trip')
  };

  function getSupabaseClient() {
    // Supports either `const supabaseClient = ...` or `window.supabaseClient = ...` in your config file.
    if (typeof supabaseClient !== 'undefined') return supabaseClient;
    return window.supabaseClient || null;
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  // ---------- helpers ----------

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const safeUrl = (url) =>
    /^https?:\/\//i.test(url || '') ? String(url).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29') : '';

  const bgStyle = (url) => (safeUrl(url) ? ` style="background-image:url('${esc(safeUrl(url))}')"` : '');
  const pad2 = (n) => String(n).padStart(2, '0');
  const peso = (n) => '₱' + Math.round(Number(n) || 0).toLocaleString('en-PH');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const parseDate = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };
  const dayDiff = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  const tripDays = (t) => dayDiff(t.start_date, t.end_date) + 1;
  const isPast = (t) => t.status === 'completed' || t.end_date < todayStr();

  const shortDate = (s) => parseDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const monDay = (s) => parseDate(s).toLocaleDateString('en-US', { month: 'short' }).toUpperCase() + ' ' + pad2(parseDate(s).getDate());
  const weekday = (s) => parseDate(s).toLocaleDateString('en-US', { weekday: 'short' });
  const fmtTime = (t) => {
    if (!t) return 'All day';
    const [h, m] = String(t).split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${pad2(m)} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  function initialsFrom(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || 'TS').slice(0, 2)).toUpperCase();
  }

  function setUserName(name) {
    const cleanName = String(name || '').trim();
    const displayName = cleanName || 'Traveler';
    const initials = initialsFrom(displayName);
    $('#top-name').textContent = displayName.split(' ')[0];
    $('#sidebar-name').textContent = displayName;
    $('#avatar-initials').textContent = initials;
    $('#top-avatar').textContent = initials;
  }

  // ---------- auth ----------

  async function initializeAuth() {
    // Add ?preview=1 to the URL to view the dashboard design without signing in.
    const previewMode = new URLSearchParams(window.location.search).get('preview') === '1';
    const client = getSupabaseClient();
    state.client = client && client.auth ? client : null;

    if (!state.client) {
      if (!previewMode) showToast('Supabase config was not loaded. Check script order and supabase-config.js.');
      return null;
    }

    try {
      const { data, error } = await state.client.auth.getSession();
      if (error) throw error;
      const session = data?.session;
      if (!session && !previewMode) {
        window.location.replace('../index/index.html');
        return null;
      }
      if (session?.user) {
        const user = session.user;
        const meta = user.user_metadata || {};
        const fullName = [meta.first_name, meta.last_name].filter(Boolean).join(' ') || meta.full_name || user.email?.split('@')[0] || 'Traveler';
        setUserName(fullName);
        return user;
      }
      setUserName('TripSync Traveler');
      return null;
    } catch (error) {
      console.error('Unable to read Supabase session:', error);
      if (!previewMode) showToast('Could not verify your session. Please sign in again.');
      return null;
    }
  }

  async function logout() {
    const client = getSupabaseClient();
    const button = $('#logout-button');
    if (button) button.disabled = true;
    try {
      if (client?.auth) {
        const { error } = await client.auth.signOut();
        if (error) throw error;
      }
      window.location.href = '../index/index.html';
    } catch (error) {
      console.error('Logout failed:', error);
      showToast(error.message || 'Could not log out. Please try again.');
      if (button) button.disabled = false;
    }
  }

  // ---------- data ----------

  async function loadData() {
    const c = state.client;
    const [trips, saved, dests, exps] = await Promise.all([
      c.from('trips').select('*').order('start_date', { ascending: true }),
      c.from('saved_places').select('*').order('created_at', { ascending: false }),
      c.from('destinations').select('*'),
      c.from('expenses').select('trip_id, amount')
    ]);

    const failed = [trips, saved, dests, exps].find((r) => r.error);
    if (failed) {
      console.error('Data load error:', failed.error);
      showToast('Could not load your data. Make sure schema.sql has been run in Supabase.');
    }

    state.trips = trips.data || [];
    state.saved = saved.data || [];
    state.destinations = (dests.data || []).sort(() => Math.random() - 0.5).slice(0, 6);
    state.expenses = exps.data || [];

    renderStats();
    renderTrips();
    renderDestinations();
    await loadFeaturedDetails();
    if (await TravelAPI.fillCovers(c, state.trips)) renderTrips();
  }

  async function loadFeaturedDetails() {
    const t = state.featured;
    state.itinerary = [];
    state.checklist = [];

    if (t && state.client) {
      const c = state.client;
      const [items, checks] = await Promise.all([
        c.from('itinerary_items').select('*').eq('trip_id', t.id)
          .order('item_date', { ascending: true }).order('item_time', { ascending: true, nullsFirst: false }),
        c.from('checklist_items').select('*').eq('trip_id', t.id).order('created_at', { ascending: true })
      ]);
      if (items.error || checks.error) console.error('Trip detail load error:', items.error || checks.error);
      state.itinerary = items.data || [];
      state.checklist = checks.data || [];
    }

    renderTimeline();
    renderChecklist();
    renderPlacePanel();
  }

  // ---------- rendering ----------

  function renderStats() {
    const upcoming = state.trips.filter((t) => !isPast(t));
    const past = state.trips.filter(isPast);

    $('#stat-upcoming').textContent = pad2(upcoming.length);
    $('#stat-upcoming-foot').textContent = upcoming.length ? 'Your next adventure is close' : 'Plan your first trip';
    $('#trip-count').textContent = upcoming.length;

    const navCount = $('#nav-trip-count');
    if (navCount) {
      navCount.textContent = upcoming.length;
      navCount.hidden = upcoming.length === 0;
    }


    const days = past.reduce((sum, t) => sum + tripDays(t), 0);
    $('#stat-days').textContent = days;
    $('#stat-days-foot').textContent = past.length ? 'Memories made so far' : 'Your first adventure awaits';

    const ids = new Set(upcoming.map((t) => t.id));
    const total = upcoming.reduce((sum, t) => sum + Number(t.budget || 0), 0);
    const planned = state.expenses.filter((e) => ids.has(e.trip_id)).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const pct = total > 0 ? Math.min(100, Math.round((planned / total) * 100)) : 0;
    const left = total - planned;

    $('#budget-planned').textContent = peso(planned);
    $('#budget-total').textContent = peso(total);
    $('#budget-fill').style.width = pct + '%';
    $('#budget-pct').textContent = `${pct}% planned`;
    $('#budget-left').textContent = left < 0 ? `${peso(-left)} over` : `${peso(left)} left`;
  }

  const STATUS = {
    saved: { label: 'Saved', cls: 'saved-status' },
    planning: { label: 'Planning', cls: 'planning' },
    booked: { label: 'Booked', cls: 'saved-status' }
  };

  function renderTrips() {
    const upcoming = state.trips.filter((t) => !isPast(t));
    state.featured = upcoming.find((t) => t.id === state.selectedId) || upcoming[0] || null;

    const featuredBox = $('#featured-trip');
    const listBox = $('#trip-list');

    if (!state.featured) {
      featuredBox.innerHTML =
        '<div class="empty-note"><strong>No upcoming trips yet</strong>Plan your first trip and it will show up here.</div>';
      listBox.innerHTML = '';
      return;
    }

    const t = state.featured;
    const today = todayStr();
    let countdown;
    if (t.start_date <= today) {
      countdown = 'Happening now';
    } else {
      const n = dayDiff(today, t.start_date);
      countdown = n === 1 ? 'Starts tomorrow' : `${n} days to go`;
    }
    const place = [t.destination, t.country].filter(Boolean).join(', ');

    featuredBox.innerHTML = `
      <article class="featured-trip">
        <div class="trip-photo${safeUrl(t.cover_url) ? '' : ' photo-fallback'}"${bgStyle(t.cover_url)}>
          <div class="photo-overlay"></div>
          <span class="trip-tag"><span class="status-dot white-dot"></span> ${t.start_date <= today ? 'HAPPENING NOW' : 'NEXT ADVENTURE'}</span>
          <button class="photo-menu" aria-label="Trip options" type="button">···</button>
          ${/wikimedia\.org/.test(t.cover_url || '') ? '<span class="photo-credit">Photo: Wikimedia Commons</span>' : ''}
          <div class="trip-menu" id="trip-menu" hidden>
            <button type="button" data-action="edit">✎ Edit trip</button>
            <button type="button" data-action="delete" class="danger">✕ Delete trip</button>
          </div>
          <div class="photo-caption">
            ${t.country ? `<span class="country-label">${esc(t.country.toUpperCase())}</span>` : ''}
            <h3>${esc(place)}</h3>
            ${t.tagline ? `<p>${esc(t.tagline)}</p>` : ''}
          </div>
        </div>
        <div class="featured-details">
          <div class="date-block"><span>${esc(parseDate(t.start_date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase())}</span><strong>${parseDate(t.start_date).getDate()}</strong><small>${esc(weekday(t.start_date).toUpperCase())}</small></div>
          <div class="trip-info">
            <strong>${esc(t.title)}</strong>
            <span>${esc(shortDate(t.start_date))} – ${esc(shortDate(t.end_date))}, ${parseDate(t.end_date).getFullYear()} <b>·</b> ${plural(tripDays(t), 'day')}</span>
            <div class="trip-meta"><span>♧ ${plural(t.travelers || 1, 'traveler')}</span><span>◷ ${esc(countdown)}</span></div>
          </div>
          <a class="round-arrow" href="itinerary/itinerary.html?trip=${esc(t.id)}" aria-label="Open ${esc(t.title)} itinerary">↗</a>
        </div>
      </article>`;

    listBox.innerHTML = upcoming
      .filter((m) => m.id !== t.id)
      .map((m) => {
        const st = STATUS[m.status] || STATUS.planning;
        const name = [m.destination, m.country].filter(Boolean).join(', ') || m.title;
        return `
        <article class="mini-trip">
          <div class="mini-image${safeUrl(m.cover_url) ? '' : ' photo-fallback'}"${bgStyle(m.cover_url)} role="img" aria-label="${esc(name)}"></div>
          <div class="mini-trip-info">
            <div class="mini-title-row"><h3>${esc(name)}</h3><span class="mini-status ${st.cls}">${st.label}</span></div>
            <p>${esc(m.tagline || m.title)}</p>
            <div class="mini-trip-meta"><span>${esc(monDay(m.start_date))} – ${esc(monDay(m.end_date))}, ${parseDate(m.end_date).getFullYear()}</span><span>·</span><span>${plural(tripDays(m), 'day')}</span></div>
          </div>
          <button class="mini-arrow" type="button" aria-label="Open ${esc(name)} trip" data-trip-id="${esc(m.id)}">↗</button>
        </article>`;
      })
      .join('');
  }

  function renderDestinations() {
    const grid = $('#destination-grid');
    if (!state.destinations.length) {
      grid.innerHTML = '<div class="empty-note" style="grid-column:1/-1"><strong>No destinations yet</strong>Places to explore will show up here.</div>';
      return;
    }
    const savedIds = new Set(state.saved.map((s) => s.destination_id).filter(Boolean));
    grid.innerHTML = state.destinations
      .map((d) => {
        const saved = savedIds.has(d.id);
        return `
        <div class="destination-card${safeUrl(d.image_url) ? '' : ' photo-fallback'}"${bgStyle(d.image_url)} data-plan="${esc(d.id)}" role="button" tabindex="0" aria-label="Plan a trip to ${esc(d.name)}">
          <span class="destination-save" role="button" tabindex="0" data-id="${esc(d.id)}" aria-label="${saved ? 'Remove' : 'Save'} ${esc(d.name)}">${saved ? '♥' : '♡'}</span>
          <em class="plan-cta">✈ Plan a trip</em>
          <div>${d.country ? `<span>${esc(d.country.toUpperCase())}</span>` : ''}<strong>${esc(d.name)}</strong>${d.tagline ? `<small>${esc(d.tagline)}</small>` : ''}</div>
        </div>`;
      })
      .join('');

    state.destinations.filter((d) => !safeUrl(d.image_url)).forEach(async (d) => {
      const page = await TravelAPI.wiki(d.name, d.country || '');
      if (!page?.photo) return;
      d.image_url = page.photo;
      const card = grid.querySelector(`[data-plan="${d.id}"]`);
      if (!card) return;
      card.classList.remove('photo-fallback');
      card.style.backgroundImage = `url('${safeUrl(page.photo)}')`;
    });
  }

  function planFromDestination(id) {
    const d = state.destinations.find((x) => x.id === id);
    if (!d) return;
    hasDraft = false;
    openTripModal();
    if ($('#trip-modal').hidden) return;
    $('#trip-destination').value = d.name;
    $('#trip-country').value = d.country || '';
    setDestHint(`✈️ Planning a trip to ${d.name}! Pick your dates, press ✨ for a trip name or 📷 for a photo.`, true);
    $('#trip-start').focus();
  }

  function renderTimeline() {
    const t = state.featured;
    const box = $('#timeline');

    if (!t) {
      $('#timeline-month').textContent = 'No upcoming trip';
      $('#timeline-trip').textContent = 'Add a trip to see your timeline';
      box.innerHTML = '';
      return;
    }

    $('#timeline-link').href = `itinerary/itinerary.html?trip=${encodeURIComponent(t.id)}`;
    $('#timeline-month').textContent = parseDate(t.start_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    $('#timeline-trip').textContent = t.title;

    if (!state.itinerary.length) {
      box.innerHTML = `<div class="empty-note">No plans for this trip yet.<br><a class="text-link" href="itinerary/itinerary.html?trip=${encodeURIComponent(t.id)}">Plan your days →</a></div>`;
      return;
    }

    const items = state.itinerary.slice(0, 4);
    box.innerHTML = items
      .map(
        (it, i) => `
      <div class="timeline-item${i === items.length - 1 ? ' last-item' : ''}">
        <span class="timeline-point${i === 0 ? ' active-point' : ''}"></span>
        <div><strong>${esc(it.title)}</strong><p>${esc(weekday(it.item_date))}, ${esc(shortDate(it.item_date))} · ${esc(fmtTime(it.item_time))}</p>${it.tag ? `<span class="timeline-chip">${esc(it.tag)}</span>` : ''}</div>
      </div>`
      )
      .join('');
  }

  function renderChecklist() {
    const box = $('#checklist');
    if (!state.featured) {
      box.innerHTML = '<div class="empty-note">Plan a trip to start your checklist.</div>';
    } else if (!state.checklist.length) {
      box.innerHTML = '<div class="empty-note">Nothing here yet. Add your first item below.</div>';
    } else {
      box.innerHTML = state.checklist
        .map(
          (i) => `<label class="check-item${i.is_done ? ' completed' : ''}"><input type="checkbox" data-id="${esc(i.id)}"${i.is_done ? ' checked' : ''} /><span class="fake-check">✓</span><span>${esc(i.title)}</span></label>`
        )
        .join('');
    }
    updateChecklist();
  }

  function updateChecklist() {
    const items = [...document.querySelectorAll('#checklist input[type="checkbox"]')];
    const done = items.filter((item) => item.checked).length;
    const count = $('#check-count');
    const fill = $('#check-progress-fill');
    if (count) count.textContent = `${done} of ${items.length}`;
    if (fill) fill.style.width = `${items.length ? (done / items.length) * 100 : 0}%`;
    items.forEach((input) => input.closest('.check-item')?.classList.toggle('completed', input.checked));
  }

  // ---------- actions ----------

  async function toggleSaved(destinationId) {
    if (!state.user || !state.client) {
      showToast('Sign in to save places.');
      return;
    }
    const dest = state.destinations.find((d) => d.id === destinationId);
    if (!dest) return;

    const existing = state.saved.find((s) => s.destination_id === destinationId);
    if (existing) {
      const { error } = await state.client.from('saved_places').delete().eq('id', existing.id);
      if (error) return showToast(error.message || 'Could not remove that place.');
      state.saved = state.saved.filter((s) => s.id !== existing.id);
      showToast('Removed from saved places.');
    } else {
      const { data, error } = await state.client
        .from('saved_places')
        .insert({
          user_id: state.user.id,
          destination_id: dest.id,
          name: dest.name,
          destination: dest.name,
          country: dest.country,
          image_url: dest.image_url
        })
        .select()
        .single();
      if (error) return showToast(error.message || 'Could not save that place.');
      state.saved.unshift(data);
      showToast('Added to saved places.');
    }
    renderStats();
    renderDestinations();
  }

  async function addChecklistItem() {
    if (!state.featured || !state.user) {
      showToast('Plan a trip first to start a checklist.');
      return;
    }
    const task = window.prompt('What do you need to prepare for your trip?');
    if (!task || !task.trim()) return;

    const { data, error } = await state.client
      .from('checklist_items')
      .insert({ trip_id: state.featured.id, user_id: state.user.id, title: task.trim() })
      .select()
      .single();
    if (error) return showToast(error.message || 'Could not add that item.');

    state.checklist.push(data);
    renderChecklist();
    showToast('Checklist item added.');
  }

  // ---------- google maps, places & weather ----------

  let gm = null;
  let mapsReady = Promise.resolve(false);
  let map = null;
  let mapMarker = null;
  let panelToken = 0;
  const weatherCache = new Map();

  let selectedPlace = null;
  let sessionToken = null;
  let suggestions = [];
  let activeIdx = -1;
  let suggestTimer = null;
  let suggestRequest = 0;

  window.gm_authFailure = () => {
    gm = null;
    showToast('Google Maps rejected the API key. Check its restrictions and enabled APIs.');
    setDestHint('Suggestions are unavailable right now. You can still type your destination.');
  };

  async function loadGoogleMaps() {
    const key = typeof GOOGLE_MAPS_API_KEY === 'string' ? GOOGLE_MAPS_API_KEY.trim() : '';
    if (!key || key.startsWith('YOUR_')) return false;

    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&v=weekly`;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Google Maps script failed to load'));
        document.head.appendChild(script);
      });

      const [places, maps, marker] = await Promise.all([
        google.maps.importLibrary('places'),
        google.maps.importLibrary('maps'),
        google.maps.importLibrary('marker')
      ]);

      gm = {
        Place: places.Place,
        AutocompleteSuggestion: places.AutocompleteSuggestion,
        AutocompleteSessionToken: places.AutocompleteSessionToken,
        Map: maps.Map,
        AdvancedMarkerElement: marker.AdvancedMarkerElement
      };
      return true;
    } catch (error) {
      console.error('Google Maps failed to load:', error);
      return false;
    }
  }

  // ----- destination autocomplete -----

  const defaultHint = () =>
    gm
      ? 'Start typing and pick a suggestion. We’ll fill in the country and map location for you.'
      : 'Type a destination and the country fills in by itself.';

  function setDestHint(text, ok = false) {
    const el = $('#dest-hint');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('ok', ok);
  }

  function closeSuggestions() {
    suggestions = [];
    activeIdx = -1;
    const list = $('#dest-suggestions');
    if (!list) return;
    list.hidden = true;
    list.innerHTML = '';
    $('#trip-destination').setAttribute('aria-expanded', 'false');
  }

  function renderSuggestions() {
    const list = $('#dest-suggestions');
    if (!suggestions.length) return closeSuggestions();

    list.innerHTML = suggestions
      .map((sug, i) => {
        const p = sug.placePrediction;
        const main = p.mainText ? p.mainText.toString() : p.text.toString();
        const secondary = p.secondaryText ? p.secondaryText.toString() : '';
        return `<li role="option" id="dest-opt-${i}" data-i="${i}" aria-selected="${i === activeIdx}" class="${i === activeIdx ? 'active' : ''}"><span class="suggest-pin">⌖</span><span class="suggest-text"><strong>${esc(main)}</strong>${secondary ? `<small>${esc(secondary)}</small>` : ''}</span></li>`;
      })
      .join('');
    list.hidden = false;
    $('#trip-destination').setAttribute('aria-expanded', 'true');
  }

  async function fetchSuggestions(query) {
    const id = ++suggestRequest;
    if (!gm) return;
    try {
      sessionToken = sessionToken || new gm.AutocompleteSessionToken();
      const { suggestions: found } = await gm.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        sessionToken
      });
      if (id !== suggestRequest) return;
      suggestions = (found || []).filter((x) => x.placePrediction).slice(0, 6);
      activeIdx = -1;
      renderSuggestions();
    } catch (error) {
      console.error('Autocomplete error:', error);
      if (id === suggestRequest) {
        closeSuggestions();
        setDestHint('Suggestions are unavailable right now. You can still type your destination.');
      }
    }
  }

  async function pickSuggestion(index) {
    const sug = suggestions[index];
    if (!sug) return;
    closeSuggestions();
    setDestHint('Getting location details…');

    try {
      const place = sug.placePrediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'addressComponents', 'id'] });

      const countryPart = (place.addressComponents || []).find((c) => (c.types || []).includes('country'));
      const name = place.displayName || (sug.placePrediction.mainText ? sug.placePrediction.mainText.toString() : '');
      const country = countryPart ? countryPart.longText : '';

      selectedPlace = { name, country, lat: place.location.lat(), lng: place.location.lng(), placeId: place.id };

      $('#trip-destination').value = name;
      if (country) $('#trip-country').value = country;
      if (!$('#trip-title').value.trim()) $('#trip-title').value = `Trip to ${name}`;
      setDestHint(`✓ ${place.formattedAddress || name}`, true);
    } catch (error) {
      console.error('Place details error:', error);
      setDestHint('Could not load that place. You can still type it in.');
    }
    sessionToken = null; // a new search session starts after a selection
  }

  function bindDestinationSuggest() {
    const input = $('#trip-destination');
    const list = $('#dest-suggestions');
    if (!input || !list) return;

    input.addEventListener('input', () => {
      selectedPlace = null; // typing again invalidates the earlier pick
      const query = input.value.trim();
      clearTimeout(suggestTimer);
      setDestHint(defaultHint());
      if (!gm || query.length < 2) return closeSuggestions();
      suggestTimer = setTimeout(() => fetchSuggestions(query), 220);
    });

    input.addEventListener('keydown', (event) => {
      if (list.hidden || !suggestions.length) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeIdx = (activeIdx + 1) % suggestions.length;
        renderSuggestions();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIdx = (activeIdx - 1 + suggestions.length) % suggestions.length;
        renderSuggestions();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        pickSuggestion(activeIdx >= 0 ? activeIdx : 0);
      } else if (event.key === 'Escape') {
        event.stopPropagation(); // close the list, not the whole form
        closeSuggestions();
      }
    });

    list.addEventListener('mousedown', (event) => {
      const li = event.target.closest('li[data-i]');
      if (!li) return;
      event.preventDefault();
      pickSuggestion(Number(li.dataset.i));
    });

    input.addEventListener('blur', () => setTimeout(closeSuggestions, 120));
  }

  // ----- map + weather panel -----

  const WEATHER_CODES = [
    [[0], '☀️', 'Clear sky'],
    [[1], '🌤️', 'Mostly clear'],
    [[2], '⛅', 'Partly cloudy'],
    [[3], '☁️', 'Overcast'],
    [[45, 48], '🌫️', 'Foggy'],
    [[51, 53, 55, 56, 57], '🌦️', 'Drizzle'],
    [[61, 63, 65, 66, 67], '🌧️', 'Rain'],
    [[71, 73, 75, 77], '❄️', 'Snow'],
    [[80, 81, 82], '🌦️', 'Rain showers'],
    [[85, 86], '🌨️', 'Snow showers'],
    [[95, 96, 99], '⛈️', 'Thunderstorm']
  ];
  const weatherInfo = (code) => {
    const hit = WEATHER_CODES.find(([codes]) => codes.includes(code));
    return hit ? [hit[1], hit[2]] : ['🌡️', 'Weather'];
  };

  function panelEmpty(heading, message) {
    $('#dest-info').hidden = true;
    $('#map').hidden = true;
    $('#weather').hidden = true;
    $('#map-open').hidden = true;
    $('#map-title').textContent = 'Map & weather';
    const empty = $('#map-empty');
    empty.innerHTML = `<strong>${esc(heading)}</strong>${esc(message)}`;
    empty.hidden = false;
  }

  async function geocodeTrip(trip) {
    if (!gm) {
      const place = await TravelAPI.geocode(trip.destination, trip.country || '');
      return place ? { lat: place.lat, lng: place.lng, placeId: null } : null;
    }
    try {
      const { places } = await gm.Place.searchByText({
        textQuery: [trip.destination, trip.country].filter(Boolean).join(', '),
        fields: ['location', 'id'],
        maxResultCount: 1
      });
      const hit = places && places[0];
      if (!hit || !hit.location) return null;
      return { lat: hit.location.lat(), lng: hit.location.lng(), placeId: hit.id };
    } catch (error) {
      console.error('Geocode error:', error);
      return null;
    }
  }

  function showMap(lat, lng, label) {
    const box = $('#map');
    box.hidden = false;
    if (!gm) {
      if (typeof L === 'undefined') return (box.hidden = true);
      if (!map) {
        map = L.map(box, { scrollWheelZoom: false }).setView([lat, lng], 10);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
        mapMarker = L.marker([lat, lng]).addTo(map);
      } else {
        map.setView([lat, lng], 10);
        mapMarker.setLatLng([lat, lng]);
      }
      mapMarker.bindPopup(esc(label));
      setTimeout(() => map.invalidateSize(), 0);
      return;
    }
    const pos = { lat, lng };
    if (!map) {
      map = new gm.Map(box, {
        center: pos,
        zoom: 9,
        mapId: 'DEMO_MAP_ID',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative'
      });
      mapMarker = new gm.AdvancedMarkerElement({ map, position: pos, title: label });
    } else {
      map.setCenter(pos);
      map.setZoom(9);
      mapMarker.position = pos;
      mapMarker.title = label;
      if (window.google?.maps?.event) google.maps.event.trigger(map, 'resize');
    }
  }

  async function loadWeather(lat, lng, label, token) {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    let cached = weatherCache.get(key);
    if (!cached || Date.now() - cached.at > 10 * 60 * 1000) {
      const url =
        'https://api.open-meteo.com/v1/forecast' +
        `?latitude=${lat}&longitude=${lng}` +
        '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
        '&timezone=auto&forecast_days=5';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
      cached = { at: Date.now(), json: await res.json() };
      weatherCache.set(key, cached);
    }
    if (token !== panelToken) return;

    const w = cached.json;
    const [icon, desc] = weatherInfo(w.current.weather_code);
    $('#weather-icon').textContent = icon;
    $('#weather-temp').textContent = `${Math.round(w.current.temperature_2m)}°C`;
    $('#weather-desc').textContent = `${desc} · right now in ${label}`;
    $('#weather-wind').textContent = `💨 ${Math.round(w.current.wind_speed_10m)} km/h`;
    $('#weather-humidity').textContent = `💧 ${Math.round(w.current.relative_humidity_2m)}%`;

    $('#forecast').innerHTML = w.daily.time
      .map((date, i) => {
        const [dayIcon] = weatherInfo(w.daily.weather_code[i]);
        const rain = w.daily.precipitation_probability_max?.[i];
        return `<div class="forecast-day"><b>${i === 0 ? 'Today' : esc(weekday(date))}</b><span>${dayIcon}</span><em>${Math.round(w.daily.temperature_2m_max[i])}° <small>${Math.round(w.daily.temperature_2m_min[i])}°</small></em><small>${rain == null ? '–' : rain + '% rain'}</small></div>`;
      })
      .join('');
    $('#weather').hidden = false;
  }

  async function renderPlacePanel() {
    const token = ++panelToken;
    const t = state.featured;
    if (!t) return panelEmpty('No destination yet', 'Plan a trip to see its map and weather.');

    const label = [t.destination, t.country].filter(Boolean).join(', ');
    await mapsReady;
    if (token !== panelToken) return;

    let lat = t.latitude != null ? Number(t.latitude) : null;
    let lng = t.longitude != null ? Number(t.longitude) : null;

    // Older trips (added without a suggestion) get located once, then saved.
    if (lat == null || lng == null) {
      const found = await geocodeTrip(t);
      if (token !== panelToken) return;
      if (found) {
        lat = found.lat;
        lng = found.lng;
        t.latitude = lat;
        t.longitude = lng;
        t.place_id = t.place_id || found.placeId || null;
        if (state.client) {
          state.client.from('trips').update({ latitude: lat, longitude: lng, place_id: t.place_id }).eq('id', t.id)
            .then(({ error }) => error && console.error('Could not save trip coordinates:', error));
        }
      }
    }

    if (lat == null || lng == null) {
      return panelEmpty('Couldn’t find this place', `We couldn’t locate “${label}” on the map.`);
    }

    $('#map-title').textContent = t.destination;
    $('#map-empty').hidden = true;

    const query = t.place_id
      ? `query=${encodeURIComponent(label)}&query_place_id=${encodeURIComponent(t.place_id)}`
      : `query=${lat},${lng}`;
    const link = $('#map-open');
    link.href = `https://www.google.com/maps/search/?api=1&${query}`;
    link.hidden = false;

    showMap(lat, lng, label);

    loadWeather(lat, lng, t.destination, token).catch((error) => {
      console.error('Weather error:', error);
      if (token === panelToken) $('#weather').hidden = true;
    });
    renderDestInfo(t, token);
  }

  const money = (amount, currency) =>
    new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

  async function renderDestInfo(t, token) {
    const box = $('#dest-info');
    box.hidden = true;
    const place = await TravelAPI.geocode(t.destination, t.country || '');
    const code = place?.countryCode;
    const [page, info, holidays] = await Promise.all([
      TravelAPI.wiki(t.destination, t.country || ''),
      code ? TravelAPI.country(code) : null,
      code ? TravelAPI.holidays(code, t.start_date, t.end_date) : null
    ]);
    const currency = info?.currency?.split(',')[0];
    const rate = currency && currency !== 'PHP' ? await TravelAPI.rate('PHP', currency) : null;
    if (token !== panelToken) return;

    const amount = Number(t.budget) > 0 ? Number(t.budget) : 1000;
    const rows = [];
    if (info) {
      const languages = (info.languages || []).map((l) => l.name).join(', ');
      rows.push(['🌏', `${info.emoji} ${info.name}`, [info.capital && `Capital: ${info.capital}`, languages].filter(Boolean).join(' · ')]);
    }
    if (currency === 'PHP') rows.push(['💱', 'Philippine peso', 'Same currency as home']);
    else if (rate) rows.push(['💱', `${peso(amount)} ≈ ${money(amount * rate, currency)}`, `${Number(t.budget) > 0 ? 'Your budget in local money' : 'Local currency'} · 1 PHP = ${rate} ${currency}`]);
    if (holidays) {
      rows.push(holidays.length
        ? ['🎉', `${holidays.length} public holiday${holidays.length === 1 ? '' : 's'} during your trip`, holidays.slice(0, 3).map((h) => `${h.name} (${shortDate(h.date)})`).join(', ')]
        : ['🗓️', 'No public holidays during your trip', 'Shops and offices should keep normal hours']);
    }

    box.innerHTML =
      rows.map(([icon, title, sub]) => `<div class="info-row"><span>${icon}</span><div><strong>${esc(title)}</strong><small>${esc(sub)}</small></div></div>`).join('') +
      (page?.extract ? `<p class="wiki-extract">${esc(page.extract)}</p>${page.url ? `<a class="text-link" href="${esc(page.url)}" target="_blank" rel="noopener">Read on Wikipedia <span>↗</span></a>` : ''}` : '');
    box.hidden = !box.innerHTML;
  }

  // ---------- plan a trip ----------

  let saving = false;
  let lastFocus = null;
  let editingTrip = null;
  let hasDraft = false;

  function showTripError(message) {
    const el = $('#trip-form-error');
    el.textContent = message;
    el.hidden = false;
  }

  function openTripModal(trip = null) {
    if (!state.user || !state.client) {
      showToast('Sign in to plan a trip.');
      return;
    }
    lastFocus = document.activeElement;
    editingTrip = trip;
    $('#trip-modal-title').textContent = trip ? 'Edit trip' : 'Plan a new trip';
    $('#trip-submit-label').textContent = trip ? 'Save changes' : 'Save trip';
    $('#trip-reset').hidden = !!trip;
    $('#trip-modal').hidden = false;
    document.body.classList.add('modal-open');
    $('#trip-destination').focus();
    if (!trip && hasDraft) return;

    $('#trip-form').reset();
    $('#ai-chips').hidden = true;
    $('#ai-tagline-chips').hidden = true;
    $('#trip-country').dataset.auto = '';
    if (trip) {
      $('#trip-title').value = trip.title;
      $('#trip-destination').value = trip.destination;
      $('#trip-country').value = trip.country || '';
      $('#trip-start').value = trip.start_date;
      $('#trip-end').value = trip.end_date;
      $('#trip-travelers').value = trip.travelers || 1;
      $('#trip-status').value = trip.status;
      $('#trip-budget').value = Number(trip.budget) || '';
      $('#trip-tagline').value = trip.tagline || '';
      $('#trip-cover').value = trip.cover_url || '';
    }
    $('#trip-form-error').hidden = true;
    selectedPlace = null;
    sessionToken = null;
    closeSuggestions();
    setDestHint(defaultHint());
  }

  function closeTripModal() {
    hasDraft = !editingTrip;
    $('#trip-modal').hidden = true;
    document.body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  async function saveTrip(event) {
    event.preventDefault();
    if (saving) return;
    $('#trip-form-error').hidden = true;

    const val = (id) => $(id).value.trim();
    const title = val('#trip-title');
    const destination = val('#trip-destination');
    const country = val('#trip-country');
    const tagline = val('#trip-tagline');
    const cover = val('#trip-cover');
    const start = $('#trip-start').value;
    const end = $('#trip-end').value;
    const travelers = Number($('#trip-travelers').value);
    const budgetRaw = $('#trip-budget').value;
    const budget = budgetRaw === '' ? 0 : Number(budgetRaw);

    if (!title || !destination || !start || !end) return showTripError('Please fill in the trip name, destination and both dates.');
    if (end < start) return showTripError('Your end date can’t be before your start date.');
    if (!Number.isInteger(travelers) || travelers < 1 || travelers > 99) return showTripError('Travelers must be a whole number from 1 to 99.');
    if (!Number.isFinite(budget) || budget < 0) return showTripError('Budget must be 0 or more.');
    if (cover && !/^https?:\/\//i.test(cover)) return showTripError('The cover photo link must start with http:// or https://');

    const submit = $('#trip-submit');
    const label = $('#trip-submit-label');
    saving = true;
    submit.disabled = true;
    label.textContent = 'Saving…';

    const sameDestination = editingTrip && editingTrip.destination === destination && (editingTrip.country || '') === country;
    const coords = selectedPlace
      ? { latitude: selectedPlace.lat, longitude: selectedPlace.lng, place_id: selectedPlace.placeId }
      : sameDestination
        ? { latitude: editingTrip.latitude, longitude: editingTrip.longitude, place_id: editingTrip.place_id }
        : { latitude: null, longitude: null, place_id: null };

    const fields = {
      title,
      destination,
      country: country || null,
      tagline: tagline || null,
      start_date: start,
      end_date: end,
      travelers,
      status: $('#trip-status').value,
      budget,
      cover_url: cover || null,
      ...coords
    };

    const query = editingTrip
      ? state.client.from('trips').update(fields).eq('id', editingTrip.id)
      : state.client.from('trips').insert({ user_id: state.user.id, ...fields });
    const { data, error } = await query.select().single();

    saving = false;
    submit.disabled = false;
    label.textContent = editingTrip ? 'Save changes' : 'Save trip';

    if (error) {
      console.error('Save trip error:', error);
      showTripError(error.message || 'Could not save your trip. Please try again.');
      return;
    }

    state.trips = state.trips.filter((t) => t.id !== data.id).concat(data);
    state.trips.sort((a, b) => a.start_date.localeCompare(b.start_date));
    state.selectedId = data.id;
    showToast(editingTrip ? 'Trip updated.' : 'Trip saved to your dashboard.');
    closeTripModal();
    hasDraft = false;
    await refreshTrips();
  }

  async function refreshTrips() {
    renderStats();
    renderTrips();
    await loadFeaturedDetails();
  }

  async function deleteTrip(trip) {
    if (!window.confirm(`Delete "${trip.title}"? Its checklist, itinerary and expenses will be deleted too.`)) return;
    const { error } = await state.client.from('trips').delete().eq('id', trip.id);
    if (error) return showToast(error.message || 'Could not delete that trip.');
    state.trips = state.trips.filter((t) => t.id !== trip.id);
    state.expenses = state.expenses.filter((e) => e.trip_id !== trip.id);
    state.selectedId = null;
    showToast('Trip deleted.');
    await refreshTrips();
  }

  // ---------- init ----------

  document.addEventListener('DOMContentLoaded', async () => {

    mapsReady = loadGoogleMaps();
    bindDestinationSuggest();

    $('#logout-button')?.addEventListener('click', logout);
    $('#mobile-menu')?.addEventListener('click', () => $('#sidebar')?.classList.toggle('open'));
    document.querySelectorAll('.side-nav a').forEach((link) => {
      link.addEventListener('click', () => $('#sidebar')?.classList.remove('open'));
    });

    $('#checklist')?.addEventListener('change', async (event) => {
      const input = event.target.closest('input[type="checkbox"]');
      if (!input) return;
      updateChecklist();
      const id = input.dataset.id;
      if (!id || !state.client) return;

      const { error } = await state.client.from('checklist_items').update({ is_done: input.checked }).eq('id', id);
      if (error) {
        input.checked = !input.checked;
        updateChecklist();
        showToast('Could not update that item.');
        return;
      }
      const item = state.checklist.find((i) => i.id === id);
      if (item) item.is_done = input.checked;
    });

    $('#add-checklist-item')?.addEventListener('click', addChecklistItem);

    $('#destination-grid')?.addEventListener('click', (event) => {
      const heart = event.target.closest('.destination-save');
      const card = event.target.closest('[data-plan]');
      if (heart) toggleSaved(heart.dataset.id);
      else if (card) planFromDestination(card.dataset.plan);
    });
    $('#destination-grid')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const heart = event.target.closest('.destination-save');
      const card = event.target.closest('[data-plan]');
      if (!heart && !card) return;
      event.preventDefault();
      if (heart) toggleSaved(heart.dataset.id);
      else planFromDestination(card.dataset.plan);
    });

    document.addEventListener('click', async (event) => {
      const menu = $('#trip-menu');
      const arrow = event.target.closest('[data-trip-id]');
      const action = event.target.closest('#trip-menu [data-action]');

      if (event.target.closest('.photo-menu')) {
        menu.hidden = !menu.hidden;
        return;
      }
      if (menu) menu.hidden = true;

      if (arrow) {
        state.selectedId = arrow.dataset.tripId;
        await refreshTrips();
        $('#my-trips').scrollIntoView({ behavior: 'smooth' });
      }
      if (action && state.featured) {
        if (action.dataset.action === 'edit') openTripModal(state.featured);
        else deleteTrip(state.featured);
      }
    });

    document.querySelectorAll('.more-button, .notification-button, #sidebar-profile').forEach((button) => {
      button.addEventListener('click', () => showToast('More TripSync features are coming soon.'));
    });
    $('#plan-trip-btn')?.addEventListener('click', (event) => {
      event.preventDefault();
      openTripModal();
    });
    $('#trip-modal-close')?.addEventListener('click', closeTripModal);
    $('#trip-cancel')?.addEventListener('click', closeTripModal);
    $('#trip-reset')?.addEventListener('click', () => {
      hasDraft = false;
      openTripModal();
    });
    $('#trip-modal')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closeTripModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !$('#trip-modal').hidden) closeTripModal();
    });
    $('#trip-form')?.addEventListener('submit', saveTrip);
    $('#trip-start')?.addEventListener('change', () => {
      const start = $('#trip-start').value;
      const end = $('#trip-end');
      end.min = start;
      if (start && (!end.value || end.value < start)) end.value = start;
    });

    // Start from empty states, then fill in from Supabase.
    renderStats();
    renderTrips();
    renderDestinations();
    renderTimeline();
    renderChecklist();
    renderPlacePanel();

    state.user = await initializeAuth();
    if (state.user && state.client) await loadData();
  });
})();