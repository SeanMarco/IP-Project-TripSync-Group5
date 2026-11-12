(() => {
  const $ = (selector) => document.querySelector(selector);
  const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
  const preview = new URLSearchParams(location.search).get('preview') === '1';

  let user = null;
  let trips = [];
  let trip = null;
  let items = [];
  let editingItem = null;
  let selectedTag = null;
  let toastTimer;

  const ICONS = { Flight: '✈', Hotel: '🛏', Food: '🍜', Activity: '⛰', Transport: '🚌', Other: '✦' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad2 = (n) => String(n).padStart(2, '0');
  const parseDate = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const toStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const nice = (s, opts) => parseDate(s).toLocaleDateString('en-US', opts);
  const fmtTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${pad2(m)} ${h < 12 ? 'AM' : 'PM'}`;
  };

  const minutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const duration = (a, b) => {
    const d = minutes(b) - minutes(a);
    return d >= 60 ? `${Math.floor(d / 60)}h${d % 60 ? ` ${d % 60}m` : ''}` : `${d}m`;
  };
  const mapLink = (place) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place}, ${trip.destination}`)}`;

  function tripDates(t) {
    const dates = [];
    for (let d = parseDate(t.start_date); toStr(d) <= t.end_date; d.setDate(d.getDate() + 1)) dates.push(toStr(d));
    return dates;
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
    const initials = (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
    $('#top-name').textContent = parts[0];
    $('#top-avatar').textContent = initials;
  }

  async function init() {
    if (!client) return showToast('Supabase config was not loaded.');
    const { data } = await client.auth.getSession();
    if (!data.session) {
      if (!preview) location.replace('../../index/index.html');
      return render();
    }
    user = data.session.user;
    const meta = user.user_metadata || {};
    setUserName([meta.first_name, meta.last_name].filter(Boolean).join(' ') || user.email.split('@')[0]);

    const { data: rows, error } = await client.from('trips').select('*').is('deleted_at', null).order('start_date', { ascending: true });
    if (error) return showToast(error.message);
    trips = rows;

    const wanted = new URLSearchParams(location.search).get('trip');
    const today = toStr(new Date());
    const first = trips.find((t) => t.id === wanted) || trips.find((t) => t.end_date >= today && t.status !== 'completed') || trips[0];
    $('#trip-select').innerHTML = trips.map((t) => `<option value="${esc(t.id)}">${esc(t.title)} · ${esc(t.destination)}</option>`).join('');
    if (first) await selectTrip(first.id);
    else render();
  }

  async function selectTrip(id) {
    trip = trips.find((t) => t.id === id) || null;
    $('#trip-select').value = id;
    history.replaceState(null, '', `?trip=${encodeURIComponent(id)}`);
    const { data, error } = await client.from('itinerary_items').select('*').eq('trip_id', id)
      .order('item_date', { ascending: true }).order('item_time', { ascending: true, nullsFirst: false });
    if (error) showToast(error.message);
    items = data || [];
    render();
  }

  function render() {
    $('#add-item-btn').disabled = !trip;
    $('#trip-select').hidden = !trips.length;

    if (!trip) {
      $('#trip-summary').textContent = '';
      $('#days').innerHTML = `<div class="empty-note"><strong>No trips yet</strong>Plan a trip first, then build its day-by-day plan here.<br><a class="text-link" href="../trips/trips.html">Go to My trips →</a></div>`;
      return;
    }

    const dates = tripDates(trip);
    const place = [trip.destination, trip.country].filter(Boolean).join(', ');
    $('#trip-summary').textContent = `${place} · ${nice(trip.start_date, { month: 'short', day: 'numeric' })} – ${nice(trip.end_date, { month: 'short', day: 'numeric', year: 'numeric' })} · ${dates.length} day${dates.length === 1 ? '' : 's'} · ${items.length} plan${items.length === 1 ? '' : 's'}`;

    const extra = [...new Set(items.map((i) => i.item_date))].filter((d) => !dates.includes(d));
    const today = toStr(new Date());
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    $('#days').innerHTML = [...dates, ...extra.sort()].map((date) => {
      const dayItems = items.filter((i) => i.item_date === date);
      const dayNo = dates.indexOf(date) + 1;
      const timed = dayItems.filter((i) => i.item_time);
      const lastEnd = timed.map((i) => i.end_time || i.item_time).sort().pop();
      const span = timed.length ? `Starts ${fmtTime(timed[0].item_time)} · Ends ${fmtTime(lastEnd)}` : '';
      return `
      <article class="day-card${date === today ? ' is-today' : ''}">
        <div class="day-head">
          <div><span class="day-no">${dayNo ? `Day ${dayNo}` : 'Outside trip dates'}${date === today ? ' · Today' : ''}</span><h3>${nice(date, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>${span ? `<small class="day-span">${span}</small>` : ''}</div>
          <button class="text-link add-to-day" type="button" data-date="${date}">＋ Add</button>
        </div>
        ${dayItems.length ? dayItems.map((i, n) => {
          const prev = dayItems.slice(0, n).find((p) => p.item_time && p.end_time && i.item_time && minutes(i.item_time) < minutes(p.end_time));
          const isNow = date === today && i.item_time && i.end_time && nowMin >= minutes(i.item_time) && nowMin < minutes(i.end_time);
          return `
          <div class="plan-row${isNow ? ' is-now' : ''}">
            <span class="plan-time">${i.item_time ? `<b>${fmtTime(i.item_time)}</b>${i.end_time ? `<small>to ${fmtTime(i.end_time)}</small>` : ''}` : '<b>Anytime</b>'}</span>
            <span class="plan-icon">${ICONS[i.tag] || '•'}</span>
            <div class="plan-text">
              <strong>${esc(i.title)}${isNow ? ' <em class="now-chip">Now</em>' : ''}</strong>
              <small>${[i.tag && esc(i.tag), i.item_time && i.end_time && duration(i.item_time, i.end_time), prev && `<span class="overlap">⚠ overlaps ${esc(prev.title)}</span>`].filter(Boolean).join(' · ')}</small>
              ${i.place ? `<a class="plan-place" href="${mapLink(i.place)}" target="_blank" rel="noopener">📍 ${esc(i.place)}</a>` : ''}
            </div>
            <button class="plan-btn" type="button" data-edit="${esc(i.id)}" aria-label="Edit">✎</button>
            <button class="plan-btn danger" type="button" data-delete="${esc(i.id)}" aria-label="Delete">✕</button>
          </div>`;
        }).join('') : '<p class="day-empty">Nothing planned yet.</p>'}
      </article>`;
    }).join('');
  }

  function setTag(tag) {
    selectedTag = tag;
    document.querySelectorAll('#tag-picker button').forEach((b) => b.classList.toggle('active', b.dataset.tag === tag));
  }

  function openModal(item = null, date = null) {
    editingItem = item;
    $('#item-form').reset();
    $('#item-form-error').hidden = true;
    $('#item-modal-title').textContent = item ? 'Edit plan' : 'Add to itinerary';
    $('#item-submit-label').textContent = item ? 'Save changes' : 'Add item';
    const dates = tripDates(trip);
    const current = item ? item.item_date : date || dates[0];
    if (!dates.includes(current)) dates.push(current);
    $('#item-date').innerHTML = dates.map((d, i) => `<option value="${d}">${i < tripDates(trip).length ? `Day ${i + 1} · ` : ''}${nice(d, { weekday: 'short', month: 'short', day: 'numeric' })}</option>`).join('');
    $('#item-date').value = current;
    $('#item-title').value = item ? item.title : '';
    $('#item-time').value = item?.item_time ? item.item_time.slice(0, 5) : '';
    $('#item-end').value = item?.end_time ? item.end_time.slice(0, 5) : '';
    $('#item-place').value = item?.place || '';
    setTag(item ? item.tag : null);
    $('#item-modal').hidden = false;
    document.body.classList.add('modal-open');
    $('#item-title').focus();
  }

  function closeModal() {
    $('#item-modal').hidden = true;
    document.body.classList.remove('modal-open');
  }

  async function saveItem(event) {
    event.preventDefault();
    const fields = {
      title: $('#item-title').value.trim(),
      item_date: $('#item-date').value,
      item_time: $('#item-time').value || null,
      end_time: $('#item-end').value || null,
      place: $('#item-place').value.trim() || null,
      tag: selectedTag
    };
    const problem = !fields.title ? 'Please describe the plan.'
      : fields.end_time && !fields.item_time ? 'Add a start time too, or clear the end time.'
      : fields.end_time && fields.end_time <= fields.item_time ? 'The end time has to be after the start time.'
      : '';
    if (problem) {
      $('#item-form-error').textContent = problem;
      $('#item-form-error').hidden = false;
      return;
    }

    $('#item-submit').disabled = true;
    const query = editingItem
      ? client.from('itinerary_items').update(fields).eq('id', editingItem.id)
      : client.from('itinerary_items').insert({ user_id: user.id, trip_id: trip.id, ...fields });
    const { data, error } = await query.select().single();
    $('#item-submit').disabled = false;
    if (error) {
      $('#item-form-error').textContent = /end_time|place/.test(error.message) ? 'Run the new itinerary SQL in Supabase first (see the setup notes).' : error.message;
      $('#item-form-error').hidden = false;
      return;
    }

    items = items.filter((i) => i.id !== data.id).concat(data)
      .sort((a, b) => a.item_date.localeCompare(b.item_date) || (a.item_time || '99').localeCompare(b.item_time || '99'));
    showToast(editingItem ? 'Plan updated.' : 'Added to your itinerary.');
    closeModal();
    render();
  }

  async function deleteItem(item) {
    if (!confirm(`Remove "${item.title}"?`)) return;
    const { error } = await client.from('itinerary_items').delete().eq('id', item.id);
    if (error) return showToast(error.message);
    items = items.filter((i) => i.id !== item.id);
    showToast('Removed from your itinerary.');
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

    $('#trip-select').addEventListener('change', (event) => selectTrip(event.target.value));
    $('#add-item-btn').addEventListener('click', () => trip && openModal());
    $('#days').addEventListener('click', (event) => {
      const add = event.target.closest('.add-to-day');
      const edit = event.target.closest('[data-edit]');
      const del = event.target.closest('[data-delete]');
      if (add) openModal(null, add.dataset.date);
      if (edit) openModal(items.find((i) => i.id === edit.dataset.edit));
      if (del) deleteItem(items.find((i) => i.id === del.dataset.delete));
    });

    $('#tag-picker').addEventListener('click', (event) => {
      const button = event.target.closest('[data-tag]');
      if (button) setTag(selectedTag === button.dataset.tag ? null : button.dataset.tag);
    });
    $('#item-form').addEventListener('submit', saveItem);
    $('#item-modal-close').addEventListener('click', closeModal);
    $('#item-cancel').addEventListener('click', closeModal);
    $('#item-modal').addEventListener('click', (event) => event.target === event.currentTarget && closeModal());
    document.addEventListener('keydown', (event) => event.key === 'Escape' && closeModal());

    init();
  });
})();