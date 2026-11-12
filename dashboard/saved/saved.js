(() => {
  const $ = (selector) => document.querySelector(selector);
  const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;

  let places = [];
  let filter = 'all';
  let toastTimer;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const isSpot = (p) => p.latitude != null;
  const savedOn = (s) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  function showToast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2800);
  }

  function setUserName(name) {
    const parts = name.trim().split(/\s+/);
    $('#top-name').textContent = parts[0];
    $('#top-avatar').textContent = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
  }

  async function init() {
    if (!client) return showToast('Supabase config was not loaded.');
    const { data } = await client.auth.getSession();
    if (!data.session) return location.replace('../../index/index.html');
    const user = data.session.user;
    const meta = user.user_metadata || {};
    setUserName([meta.first_name, meta.last_name].filter(Boolean).join(' ') || user.email.split('@')[0]);

    const { data: rows, error } = await client.from('saved_places').select('*').order('created_at', { ascending: false });
    if (error) return showToast(error.message);
    places = rows || [];
    render();
    fillPhotos();
  }

  async function fillPhotos() {
    if (typeof TravelAPI === 'undefined') return;
    for (const p of places.filter((x) => !x.image_url)) {
      const page = await TravelAPI.wiki(p.name, isSpot(p) ? '' : p.country || '');
      if (!page?.photo) continue;
      p.image_url = page.photo;
      const card = document.querySelector(`[data-card="${p.id}"] .saved-photo`);
      if (card) {
        card.style.backgroundImage = `url('${page.photo}')`;
        card.classList.remove('photo-fallback');
      }
    }
  }

  function render() {
    const spots = places.filter(isSpot).length;
    $('#count-all').textContent = places.length;
    $('#count-dest').textContent = places.length - spots;
    $('#count-spot').textContent = spots;
    $('#saved-summary').textContent = places.length
      ? `${places.length - spots} destination${places.length - spots === 1 ? '' : 's'} and ${spots} spot${spots === 1 ? '' : 's'} saved`
      : '';

    const list = places.filter((p) => filter === 'all' || (filter === 'spot') === isSpot(p));
    if (!places.length) {
      $('#saved-grid').innerHTML = `<div class="empty-note"><strong>Nothing saved yet</strong>Tap ♡ on a destination in Explore, or ♡ Save on a place in Where to go.<br><a class="text-link" href="../dashboard.html#destinations">Browse destinations →</a></div>`;
      return;
    }
    if (!list.length) {
      $('#saved-grid').innerHTML = `<div class="empty-note">No ${filter === 'spot' ? 'spots' : 'destinations'} saved yet.</div>`;
      return;
    }

    $('#saved-grid').innerHTML = list.map((p) => {
      const where = isSpot(p) ? `Near ${[p.destination, p.country].filter(Boolean).join(', ')}` : p.country || '';
      const plan = `../dashboard.html?plan=${encodeURIComponent(p.destination || p.name)}&country=${encodeURIComponent(p.country || '')}`;
      return `
      <article class="saved-card" data-card="${esc(p.id)}">
        <div class="saved-photo${p.image_url ? '' : ' photo-fallback'}"${p.image_url ? ` style="background-image:url('${esc(p.image_url)}')"` : ''}>
          <span class="saved-kind${isSpot(p) ? ' is-spot' : ''}">${isSpot(p) ? '📍 Spot' : '✈ Destination'}</span>
          <button class="saved-remove" type="button" data-remove="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">✕</button>
        </div>
        <div class="saved-body">
          <strong>${esc(p.name)}</strong>
          <span>${esc(where)}</span>
          <small>Saved ${savedOn(p.created_at)}</small>
        </div>
        <div class="saved-actions">
          ${isSpot(p)
            ? `<a class="ghost-button" href="https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}" target="_blank" rel="noopener">Open in Maps ↗</a>
               <a class="ghost-button" href="https://en.wikipedia.org/wiki/${encodeURIComponent(p.name.replace(/ /g, '_'))}" target="_blank" rel="noopener">Wikipedia ↗</a>`
            : `<a class="primary-button" href="${plan}"><span>＋</span> Plan a trip</a>`}
        </div>
      </article>`;
    }).join('');
  }

  async function removePlace(place) {
    if (!confirm(`Remove "${place.name}" from saved places?`)) return;
    const { error } = await client.from('saved_places').delete().eq('id', place.id);
    if (error) return showToast(error.message);
    places = places.filter((p) => p.id !== place.id);
    showToast('Removed from saved places.');
    render();
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

    document.querySelector('.trip-filters').addEventListener('click', (event) => {
      const tab = event.target.closest('[data-filter]');
      if (!tab) return;
      filter = tab.dataset.filter;
      document.querySelectorAll('.filter-tab').forEach((t) => t.classList.toggle('active', t === tab));
      render();
    });
    $('#saved-grid').addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove]');
      if (remove) removePlace(places.find((p) => p.id === remove.dataset.remove));
    });

    init();
  });
})();