document.addEventListener('DOMContentLoaded', () => {
  const $ = (selector) => document.querySelector(selector);
  const title = $('#trip-title');
  const destination = $('#trip-destination');
  const country = $('#trip-country');
  const tagline = $('#trip-tagline');
  const cover = $('#trip-cover');
  const hint = $('#dest-hint');
  const button = $('#ai-suggest');
  const chips = $('#ai-chips');
  const tagButton = $('#ai-suggest-tagline');
  const tagChips = $('#ai-tagline-chips');
  const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;

  country.addEventListener('input', () => (country.dataset.auto = ''));

  destination.addEventListener('change', async () => {
    const name = destination.value.trim();
    if (!name) return;
    if (!country.value || country.dataset.auto) {
      const place = await TravelAPI.geocode(name);
      if (place?.country) {
        country.value = place.country;
        country.dataset.auto = '1';
        if (hint) hint.textContent = `📍 ${place.name} is in ${place.country}${place.admin1 ? ` (${place.admin1})` : ''}. Change it if that's not the one.`;
      }
    }
  });

  const wikiButton = $('#wiki-photo');
  const preview = $('#cover-preview');

  function showPreview() {
    const url = cover.value.trim();
    preview.hidden = !/^https?:\/\//i.test(url);
    if (!preview.hidden) preview.src = url;
  }

  cover.addEventListener('input', showPreview);
  preview.addEventListener('error', () => (preview.hidden = true));
  new MutationObserver(showPreview).observe($('#trip-modal'), { attributes: true, attributeFilter: ['hidden'] });

  wikiButton.addEventListener('click', async () => {
    const place = destination.value.trim();
    if (!place) {
      destination.focus();
      if (hint) hint.textContent = 'Type a destination first, then press 📷 Wikipedia.';
      return;
    }
    wikiButton.disabled = true;
    wikiButton.textContent = '📷 Finding…';
    const page = await TravelAPI.wiki(place, country.value.trim());
    wikiButton.disabled = false;
    wikiButton.textContent = '📷 Wikipedia';
    if (!page?.photo) {
      if (hint) hint.textContent = `Wikipedia has no photo for ${place}. You can paste your own link instead.`;
      return;
    }
    cover.value = page.photo;
    showPreview();
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

  function showChips(box, suggestions, note, forTagline) {
    box.innerHTML = suggestions
      .map(() => '<button type="button" class="ai-chip"><b></b><small></small></button>')
      .join('') + (note ? `<p class="ai-note">${note}</p>` : '');
    box.querySelectorAll('.ai-chip').forEach((chip, i) => {
      const s = suggestions[i];
      chip.querySelector('b').textContent = forTagline ? s.tagline : s.name;
      chip.querySelector('small').textContent = forTagline ? '' : s.tagline;
      chip.addEventListener('click', () => {
        if (forTagline) tagline.value = s.tagline;
        else {
          title.value = s.name;
          if (!tagline.value.trim()) tagline.value = s.tagline;
        }
        box.hidden = true;
      });
    });
    box.hidden = false;
  }

  async function suggest(btn, box, forTagline) {
    const place = destination.value.trim();
    if (!place) {
      destination.focus();
      if (hint) hint.textContent = 'Type a destination first, then press ✨ Suggest.';
      return;
    }

    btn.disabled = true;
    btn.textContent = '✨ Thinking…';
    try {
      const { data, error } = await client.functions.invoke('suggest-trip-name', {
        body: {
          destination: place,
          country: country.value.trim(),
          days: tripDays(),
          travelers: Number($('#trip-travelers').value) || 1,
          title: forTagline ? title.value.trim() : '',
          tagline: forTagline ? '' : tagline.value.trim()
        }
      });
      if (error || !data?.suggestions?.length) throw error || new Error('No suggestions');
      showChips(box, data.suggestions, '', forTagline);
    } catch (error) {
      console.error('AI suggestion failed:', (await error?.context?.json?.().catch(() => null))?.error || error);
      showChips(box, basicNames(place, tripDays()), 'AI is unavailable right now, so here are some basic ideas.', forTagline);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Suggest';
    }
  }

  button.addEventListener('click', () => suggest(button, chips, false));
  tagButton.addEventListener('click', () => suggest(tagButton, tagChips, true));
  $('#trip-form').addEventListener('submit', () => (chips.hidden = tagChips.hidden = true));
});