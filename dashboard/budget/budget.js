(() => {
  const $ = (selector) => document.querySelector(selector);
  const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;

  let user = null;
  let trips = [];
  let trip = null;
  let expenses = [];
  let editing = null;
  let category = 'Other';
  let local = null;
  let toastTimer;

  const CATS = { Food: '🍜', Transport: '🚌', Stay: '🛏', Activities: '⛰', Shopping: '🛍', Other: '✦' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad2 = (n) => String(n).padStart(2, '0');
  const toStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const parseDate = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const nice = (s, opts) => parseDate(s).toLocaleDateString('en-US', opts);
  const peso = (n) => '₱' + (Number(n) || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
  const money = (n, cur) => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
    } catch {
      return `${Math.round(n).toLocaleString()} ${cur}`;
    }
  };
  const days = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000) + 1;

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
    user = data.session.user;
    const meta = user.user_metadata || {};
    setUserName([meta.first_name, meta.last_name].filter(Boolean).join(' ') || user.email.split('@')[0]);

    const { data: rows, error } = await client.from('trips').select('*').is('deleted_at', null).order('start_date', { ascending: true });
    if (error) return showToast(error.message);
    trips = rows || [];

    const wanted = new URLSearchParams(location.search).get('trip');
    const today = toStr(new Date());
    const first = trips.find((t) => t.id === wanted) || trips.find((t) => t.end_date >= today && t.status !== 'completed') || trips[trips.length - 1];
    $('#trip-select').innerHTML = trips.map((t) => `<option value="${esc(t.id)}">${esc(t.title)} · ${esc(t.destination)}</option>`).join('');
    if (first) await selectTrip(first.id);
    else render();
  }

  async function selectTrip(id) {
    trip = trips.find((t) => t.id === id) || null;
    $('#trip-select').value = id;
    history.replaceState(null, '', `?trip=${encodeURIComponent(id)}`);
    local = null;
    const { data, error } = await client.from('expenses').select('*').eq('trip_id', id).order('created_at', { ascending: false });
    if (error) showToast(error.message);
    expenses = sortList(data || []);
    render();
    loadLocal(trip);
  }

  const sortList = (list) => list.sort((a, b) => (b.spent_on || '').localeCompare(a.spent_on || '') || (b.created_at || '').localeCompare(a.created_at || ''));

  async function loadLocal(t) {
    if (typeof TravelAPI === 'undefined') return;
    const place = await TravelAPI.geocode(t.destination, t.country || '');
    const info = place?.countryCode ? await TravelAPI.country(place.countryCode) : null;
    const cur = info?.currency?.split(',')[0];
    if (!cur || cur === 'PHP' || t !== trip) return;
    const rate = await TravelAPI.rate('PHP', cur);
    if (!rate || t !== trip) return;
    local = { cur, rate };
    render();
  }

  function render() {
    $('#add-expense-btn').disabled = !trip;
    $('#trip-select').hidden = !trips.length;
    $('#budget-top').hidden = !trip;
    $('#expense-panel').hidden = !trip;

    if (!trip) {
      $('#trip-summary').textContent = '';
      $('#budget-empty').innerHTML = '<div class="empty-note"><strong>No trips yet</strong>Plan a trip first, then track what you spend here.<br><a class="text-link" href="../trips/trips.html">Go to My trips →</a></div>';
      return;
    }
    $('#budget-empty').innerHTML = '';

    const length = days(trip.start_date, trip.end_date);
    $('#trip-summary').textContent = `${[trip.destination, trip.country].filter(Boolean).join(', ')} · ${nice(trip.start_date, { month: 'short', day: 'numeric' })} – ${nice(trip.end_date, { month: 'short', day: 'numeric', year: 'numeric' })} · ${length} day${length === 1 ? '' : 's'}`;

    const budget = Number(trip.budget) || 0;
    const spent = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const left = budget - spent;
    const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;

    $('#spent').textContent = peso(spent);
    $('#of-budget').textContent = budget > 0 ? `of ${peso(budget)} budget` : 'no budget set yet';
    $('#budget-fill').style.width = `${Math.min(100, pct)}%`;
    $('#budget-fill').className = pct > 100 ? 'over' : pct >= 80 ? 'warn' : '';
    $('#budget-pct').textContent = budget > 0 ? `${pct}% used` : 'Set a budget to track it';
    $('#budget-left').textContent = budget > 0 ? (left < 0 ? `${peso(-left)} over budget` : `${peso(left)} left`) : '';
    $('#budget-left').className = left < 0 ? 'is-over' : '';

    const today = toStr(new Date());
    const notes = [];
    if (budget > 0 && left > 0 && today <= trip.end_date) {
      const from = today > trip.start_date ? today : trip.start_date;
      const remaining = days(from, trip.end_date);
      notes.push(`📅 About <b>${peso(Math.floor(left / remaining))}</b> a day for the ${remaining} day${remaining === 1 ? '' : 's'} left`);
    }
    if (local) {
      notes.push(`💱 ${budget > 0 && left > 0 ? `${peso(left)} left ≈ <b>${money(left * local.rate, local.cur)}</b>` : `${peso(1000)} ≈ <b>${money(1000 * local.rate, local.cur)}</b>`} · 1 PHP = ${local.rate} ${local.cur}`);
    }
    if (budget > 0 && left < 0) notes.push('⚠ You went over budget. Raise the budget or cut back on something.');
    $('#budget-notes').innerHTML = notes.map((n) => `<p>${n}</p>`).join('');

    const totals = Object.keys(CATS).map((c) => [c, expenses.filter((e) => (e.category || 'Other') === c).reduce((sum, e) => sum + Number(e.amount || 0), 0)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    $('#cat-list').innerHTML = totals.length
      ? totals.map(([c, v]) => `
        <div class="cat-row">
          <span class="cat-icon">${CATS[c]}</span>
          <div class="cat-body">
            <div class="cat-line"><strong>${c}</strong><span>${peso(v)} · ${Math.round((v / spent) * 100)}%</span></div>
            <div class="cat-bar"><span style="width:${(v / totals[0][1]) * 100}%"></span></div>
          </div>
        </div>`).join('')
      : '<p class="cat-empty">Your spending by category shows up here.</p>';

    $('#expense-count').textContent = expenses.length;
    $('#expense-list').innerHTML = expenses.length
      ? expenses.map((e) => `
        <div class="expense-row">
          <span class="cat-icon">${CATS[e.category] || '✦'}</span>
          <div class="expense-text">
            <strong>${esc(e.label || 'Expense')}</strong>
            <small>${[esc(e.category || 'Other'), e.spent_on && nice(e.spent_on, { weekday: 'short', month: 'short', day: 'numeric' })].filter(Boolean).join(' · ')}</small>
          </div>
          <div class="expense-amount"><strong>${peso(e.amount)}</strong>${local ? `<small>≈ ${money(e.amount * local.rate, local.cur)}</small>` : ''}</div>
          <button class="plan-btn" type="button" data-edit="${esc(e.id)}" aria-label="Edit">✎</button>
          <button class="plan-btn danger" type="button" data-delete="${esc(e.id)}" aria-label="Delete">✕</button>
        </div>`).join('')
      : '<p class="day-empty">No expenses yet. Press ＋ Add expense when you pay for something.</p>';
  }

  function setCategory(c) {
    category = c;
    document.querySelectorAll('#cat-picker button').forEach((b) => b.classList.toggle('active', b.dataset.cat === c));
  }

  function updateHint() {
    const amount = Number($('#expense-amount').value);
    $('#convert-hint').textContent = local && $('#expense-currency').value !== 'PHP' && amount > 0 ? `≈ ${peso(amount / local.rate)} will be saved` : '';
  }

  function openModal(expense = null) {
    editing = expense;
    $('#expense-form').reset();
    $('#expense-form-error').hidden = true;
    $('#expense-modal-title').textContent = expense ? 'Edit expense' : 'Add expense';
    $('#expense-submit-label').textContent = expense ? 'Save changes' : 'Add expense';
    $('#expense-currency').innerHTML = `<option value="PHP">₱ PHP</option>${local ? `<option value="${local.cur}">${local.cur}</option>` : ''}`;
    $('#expense-currency').value = 'PHP';
    const today = toStr(new Date());
    $('#expense-date').value = expense?.spent_on || (today >= trip.start_date && today <= trip.end_date ? today : trip.start_date);
    $('#expense-label').value = expense?.label || '';
    $('#expense-amount').value = expense ? Number(expense.amount) : '';
    setCategory(expense?.category || 'Food');
    updateHint();
    $('#expense-modal').hidden = false;
    document.body.classList.add('modal-open');
    $('#expense-label').focus();
  }

  function closeModal() {
    $('#expense-modal').hidden = true;
    document.body.classList.remove('modal-open');
  }

  function showError(message) {
    $('#expense-form-error').textContent = message;
    $('#expense-form-error').hidden = false;
  }

  async function saveExpense(event) {
    event.preventDefault();
    const raw = Number($('#expense-amount').value);
    const amount = $('#expense-currency').value === 'PHP' ? raw : raw / local.rate;
    const fields = {
      label: $('#expense-label').value.trim(),
      amount: Math.round(amount * 100) / 100,
      category,
      spent_on: $('#expense-date').value || null
    };
    if (!fields.label) return showError('Please say what you paid for.');
    if (!$('#expense-amount').value || !Number.isFinite(raw) || raw <= 0) return showError('Enter an amount more than 0.');
    if (!fields.spent_on) return showError('Pick the date you paid.');

    $('#expense-submit').disabled = true;
    const query = editing
      ? client.from('expenses').update(fields).eq('id', editing.id)
      : client.from('expenses').insert({ user_id: user.id, trip_id: trip.id, ...fields });
    const { data, error } = await query.select().single();
    $('#expense-submit').disabled = false;
    if (error) return showError(/category|spent_on/.test(error.message) ? 'Run the new budget SQL in Supabase first (see the setup notes).' : error.message);

    expenses = sortList(expenses.filter((e) => e.id !== data.id).concat(data));
    showToast(editing ? 'Expense updated.' : 'Expense added.');
    closeModal();
    render();
  }

  async function deleteExpense(expense) {
    if (!confirm(`Remove "${expense.label || 'this expense'}"?`)) return;
    const { error } = await client.from('expenses').delete().eq('id', expense.id);
    if (error) return showToast(error.message);
    expenses = expenses.filter((e) => e.id !== expense.id);
    showToast('Expense removed.');
    render();
  }

  function toggleBudgetForm(show) {
    $('#budget-form').hidden = !show;
    $('#budget-edit').hidden = show;
    if (show) {
      $('#budget-input').value = Number(trip.budget) || '';
      $('#budget-input').focus();
    }
  }

  async function saveBudget(event) {
    event.preventDefault();
    const budget = Number($('#budget-input').value || 0);
    if (!Number.isFinite(budget) || budget < 0) return showToast('Budget must be 0 or more.');
    const { error } = await client.from('trips').update({ budget }).eq('id', trip.id);
    if (error) return showToast(error.message);
    trip.budget = budget;
    toggleBudgetForm(false);
    showToast('Budget updated.');
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
    $('#add-expense-btn').addEventListener('click', () => trip && openModal());
    $('#expense-list').addEventListener('click', (event) => {
      const edit = event.target.closest('[data-edit]');
      const del = event.target.closest('[data-delete]');
      if (edit) openModal(expenses.find((e) => e.id === edit.dataset.edit));
      if (del) deleteExpense(expenses.find((e) => e.id === del.dataset.delete));
    });
    $('#budget-edit').addEventListener('click', () => toggleBudgetForm(true));
    $('#budget-cancel').addEventListener('click', () => toggleBudgetForm(false));
    $('#budget-form').addEventListener('submit', saveBudget);

    $('#cat-picker').addEventListener('click', (event) => {
      const button = event.target.closest('[data-cat]');
      if (button) setCategory(button.dataset.cat);
    });
    $('#expense-amount').addEventListener('input', updateHint);
    $('#expense-currency').addEventListener('change', updateHint);
    $('#expense-form').addEventListener('submit', saveExpense);
    $('#expense-modal-close').addEventListener('click', closeModal);
    $('#expense-cancel').addEventListener('click', closeModal);
    $('#expense-modal').addEventListener('click', (event) => event.target === event.currentTarget && closeModal());
    document.addEventListener('keydown', (event) => event.key === 'Escape' && !$('#expense-modal').hidden && closeModal());

    init();
  });
})();