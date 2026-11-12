(() => {
  const $ = (selector) => document.querySelector(selector);
  const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  const preview = new URLSearchParams(location.search).get('preview') === '1';

  let user = null;
  let trips = [];
  let filter = 'all';
  let editingTrip = null;
  let hasDraft = false;
  let toastTimer;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad2 = (n) => String(n).padStart(2, '0');
  const peso = (n) => '₱' + Math.round(Number(n) || 0).toLocaleString('en-PH');
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const parseDate = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };
  const tripDays = (t) => Math.round((parseDate(t.end_date) - parseDate(t.start_date)) / 86400000) + 1;
  const isPast = (t) => t.status === 'completed' || t.end_date < today();
  const shortDate = (s) => parseDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const STATUS = { planning: 'Planning', booked: 'Booked', saved: 'Saved', completed: 'Completed' };

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function setUserName(name) {
    const parts = name.trim().split(/\s+/);
    const initials = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
    $('#top-name').textContent = parts[0];
    $('#top-avatar').textContent = initials;
  }

  async function init() {
    if (!client) return showToast('Supabase config was not loaded.');
    const { data } = await client.auth.getSession();
    if (!data.session) {
      if (!preview) location.replace('../../index/index.html');
      return;
    }
    user = data.session.user;
    const meta = user.user_metadata || {};
    setUserName([meta.first_name, meta.last_name].filter(Boolean).join(' ') || user.email.split('@')[0]);

    const { data: rows, error } = await client.from('trips').select('*').order('start_date', { ascending: true });
    if (error) return showToast(error.message);
    trips = rows;
    render();
    if (await TravelAPI.fillCovers(client, trips)) render();
  }

  function render() {
    const upcoming = trips.filter((t) => !isPast(t));
    $('#count-all').textContent = trips.length;
    $('#count-upcoming').textContent = upcoming.length;
    $('#count-past').textContent = trips.length - upcoming.length;
    $('#nav-trip-count').textContent = upcoming.length;
    $('#nav-trip-count').hidden = !upcoming.length;

    const search = $('#trip-search').value.trim().toLowerCase();
    const shown = trips
      .filter((t) => filter === 'all' || (filter === 'past') === isPast(t))
      .filter((t) => [t.title, t.destination, t.country].join(' ').toLowerCase().includes(search));

    if (!shown.length) {
      $('#trips-grid').innerHTML = `<div class="empty-note"><strong>${trips.length ? 'No trips match' : 'No trips yet'}</strong>${trips.length ? 'Try another filter or search.' : 'Press "Plan a new trip" to add your first one.'}</div>`;
      return;
    }

    $('#trips-grid').innerHTML = shown.map((t) => {
      const place = [t.destination, t.country].filter(Boolean).join(', ');
      const cover = /^https?:\/\//i.test(t.cover_url || '') ? ` style="background-image:url('${esc(t.cover_url)}')"` : '';
      return `
      <article class="trip-card${isPast(t) ? ' is-past' : ''}">
        <div class="trip-card-photo${cover ? '' : ' photo-fallback'}"${cover}>
          <span class="mini-status status-${esc(t.status)}">${STATUS[t.status] || 'Planning'}</span>
        </div>
        <div class="trip-card-body">
          <h3>${esc(t.title)}</h3>
          <p class="trip-card-place">${esc(place)}</p>
          ${t.tagline ? `<p class="trip-card-tagline">${esc(t.tagline)}</p>` : ''}
          <div class="trip-card-meta">
            <span>▦ ${shortDate(t.start_date)} – ${shortDate(t.end_date)}</span>
            <span>◷ ${plural(tripDays(t), 'day')}</span>
            <span>♧ ${plural(t.travelers || 1, 'traveler')}</span>
            <span>₱ ${peso(t.budget).slice(1)}</span>
          </div>
        </div>
        <div class="trip-card-actions">
          <a class="ghost-button" href="../dashboard.html?trip=${esc(t.id)}">Open</a>
          <button class="ghost-button" type="button" data-edit="${esc(t.id)}">Edit</button>
          <button class="ghost-button danger" type="button" data-delete="${esc(t.id)}">Delete</button>
        </div>
      </article>`;
    }).join('');
  }

  function openModal(trip = null) {
    if (!user) return showToast('Sign in to plan a trip.');
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
    $('#trip-form-error').hidden = true;
    $('#trip-country').dataset.auto = '';
    $('#dest-hint').textContent = 'Type a destination and the country fills in by itself.';
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
  }

  function closeModal() {
    hasDraft = !editingTrip;
    $('#trip-modal').hidden = true;
    document.body.classList.remove('modal-open');
  }

  function showError(message) {
    $('#trip-form-error').textContent = message;
    $('#trip-form-error').hidden = false;
  }

  async function saveTrip(event) {
    event.preventDefault();
    const val = (id) => $(id).value.trim();
    const fields = {
      title: val('#trip-title'),
      destination: val('#trip-destination'),
      country: val('#trip-country') || null,
      tagline: val('#trip-tagline') || null,
      start_date: $('#trip-start').value,
      end_date: $('#trip-end').value,
      travelers: Number($('#trip-travelers').value),
      status: $('#trip-status').value,
      budget: Number($('#trip-budget').value || 0),
      cover_url: val('#trip-cover') || null
    };

    if (!fields.title || !fields.destination || !fields.start_date || !fields.end_date) return showError('Please fill in the trip name, destination and both dates.');
    if (fields.end_date < fields.start_date) return showError('Your end date can’t be before your start date.');
    if (!Number.isInteger(fields.travelers) || fields.travelers < 1 || fields.travelers > 99) return showError('Travelers must be a whole number from 1 to 99.');
    if (fields.budget < 0) return showError('Budget must be 0 or more.');
    if (fields.cover_url && !/^https?:\/\//i.test(fields.cover_url)) return showError('The cover photo link must start with http:// or https://');

    if (editingTrip && (editingTrip.destination !== fields.destination || (editingTrip.country || null) !== fields.country)) {
      Object.assign(fields, { latitude: null, longitude: null, place_id: null });
    }

    $('#trip-submit').disabled = true;
    const query = editingTrip
      ? client.from('trips').update(fields).eq('id', editingTrip.id)
      : client.from('trips').insert({ user_id: user.id, ...fields });
    const { data, error } = await query.select().single();
    $('#trip-submit').disabled = false;
    if (error) return showError(error.message);

    trips = trips.filter((t) => t.id !== data.id).concat(data).sort((a, b) => a.start_date.localeCompare(b.start_date));
    showToast(editingTrip ? 'Trip updated.' : 'Trip saved.');
    closeModal();
    hasDraft = false;
    render();
  }

  async function deleteTrip(trip) {
    if (!confirm(`Delete "${trip.title}"? Its checklist, itinerary and expenses will be deleted too.`)) return;
    const { error } = await client.from('trips').delete().eq('id', trip.id);
    if (error) return showToast(error.message);
    trips = trips.filter((t) => t.id !== trip.id);
    showToast('Trip deleted.');
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('#footer-year').textContent = new Date().getFullYear();
    $('#theme-toggle').addEventListener('click', () => {
      const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      localStorage.setItem('theme', theme);
    });
    $('#logout-button').addEventListener('click', async () => {
      await client?.auth.signOut();
      location.href = '../../index/index.html';
    });

    document.querySelectorAll('.filter-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelector('.filter-tab.active').classList.remove('active');
        tab.classList.add('active');
        filter = tab.dataset.filter;
        render();
      });
    });
    $('#trip-search').addEventListener('input', render);

    $('#trips-grid').addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit]');
      const del = event.target.closest('[data-delete]');
      if (edit) openModal(trips.find((t) => t.id === edit.dataset.edit));
      if (del) deleteTrip(trips.find((t) => t.id === del.dataset.delete));
    });

    $('#new-trip-btn').addEventListener('click', () => openModal());
    $('#trip-modal-close').addEventListener('click', closeModal);
    $('#trip-cancel').addEventListener('click', closeModal);
    $('#trip-reset').addEventListener('click', () => {
      hasDraft = false;
      openModal();
    });
    $('#trip-modal').addEventListener('click', (event) => event.target === event.currentTarget && closeModal());
    document.addEventListener('keydown', (event) => event.key === 'Escape' && !$('#trip-modal').hidden && closeModal());
    $('#trip-form').addEventListener('submit', saveTrip);
    $('#trip-start').addEventListener('change', () => {
      $('#trip-end').min = $('#trip-start').value;
      if ($('#trip-end').value < $('#trip-start').value) $('#trip-end').value = $('#trip-start').value;
    });

    render();
    init();
  });
})();