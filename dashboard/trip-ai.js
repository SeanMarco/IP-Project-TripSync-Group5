document.addEventListener('DOMContentLoaded', () => {
  const $ = (selector) => document.querySelector(selector);
  const title = $('#trip-title');
  const destination = $('#trip-destination');
  const country = $('#trip-country');
  const tagline = $('#trip-tagline');
  const hint = $('#dest-hint');
  const button = $('#ai-suggest');
  const chips = $('#ai-chips');
  const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;

  country.addEventListener('input', () => (country.dataset.auto = ''));

  destination.addEventListener('change', async () => {
    const name = destination.value.trim();
    if (!name || (country.value && !country.dataset.auto)) return;
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(name)}`);
      const place = (await res.json()).results?.[0];
      if (!place?.country) return;
      country.value = place.country;
      country.dataset.auto = '1';
      if (hint) hint.textContent = `📍 ${place.name} is in ${place.country}${place.admin1 ? ` (${place.admin1})` : ''}. Change it if that's not the one.`;
    } catch (error) {
      console.error('Country lookup failed:', error);
    }
  });

  function tripDays() {
    const start = $('#trip-start').value;
    const end = $('#trip-end').value;
    return start && end ? Math.round((new Date(end) - new Date(start)) / 86400000) + 1 : null;
  }

  function basicNames(place, days) {
    return [
      { name: `${place} Getaway`, tagline: 'Time to explore somewhere new' },
      { name: days ? `${days} Days in ${place}` : `Hello, ${place}`, tagline: 'Every day a new adventure' },
      { name: `Escape to ${place}`, tagline: 'Pack light, stay curious' }
    ];
  }

  function showChips(suggestions, note) {
    chips.innerHTML = suggestions
      .map((s, i) => `<button type="button" class="ai-chip" data-i="${i}"><b></b><small></small></button>`)
      .join('') + (note ? `<p class="ai-note">${note}</p>` : '');
    chips.querySelectorAll('.ai-chip').forEach((chip, i) => {
      chip.querySelector('b').textContent = suggestions[i].name;
      chip.querySelector('small').textContent = suggestions[i].tagline;
      chip.addEventListener('click', () => {
        title.value = suggestions[i].name;
        if (!tagline.value.trim()) tagline.value = suggestions[i].tagline;
        chips.hidden = true;
      });
    });
    chips.hidden = false;
  }

  button.addEventListener('click', async () => {
    const place = destination.value.trim();
    if (!place) {
      destination.focus();
      if (hint) hint.textContent = 'Type a destination first, then press ✨ Suggest.';
      return;
    }

    button.disabled = true;
    button.textContent = '✨ Thinking…';
    try {
      const { data, error } = await client.functions.invoke('suggest-trip-name', {
        body: {
          destination: place,
          country: country.value.trim(),
          days: tripDays(),
          travelers: Number($('#trip-travelers').value) || 1,
          tagline: tagline.value.trim()
        }
      });
      if (error || !data?.suggestions?.length) throw error || new Error('No suggestions');
      showChips(data.suggestions);
    } catch (error) {
      console.error('AI suggestion failed:', (await error?.context?.json?.().catch(() => null))?.error || error);
      showChips(basicNames(place, tripDays()), 'AI is unavailable right now, so here are some basic ideas.');
    } finally {
      button.disabled = false;
      button.textContent = '✨ Suggest';
    }
  });

  $('#trip-modal-close').addEventListener('click', () => (chips.hidden = true));
  $('#trip-cancel').addEventListener('click', () => (chips.hidden = true));
  $('#trip-form').addEventListener('submit', () => (chips.hidden = true));
});