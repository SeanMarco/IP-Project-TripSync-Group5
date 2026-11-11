const TravelAPI = (() => {
  const cache = new Map();

  const memo = (key, load) => {
    if (!cache.has(key)) {
      cache.set(key, load().catch((error) => {
        console.error(`TravelAPI ${key} failed:`, error);
        cache.delete(key);
        return null;
      }));
    }
    return cache.get(key);
  };

  const getJSON = async (url, options) => {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  };

  const geocode = (name, country = '') => memo(`geocode:${name}|${country}`, async () => {
    const { results = [] } = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&name=${encodeURIComponent(name)}`);
    const hit = results.find((r) => country && r.country?.toLowerCase() === country.toLowerCase()) || results[0];
    return hit ? { name: hit.name, country: hit.country, countryCode: hit.country_code, admin1: hit.admin1, lat: hit.latitude, lng: hit.longitude } : null;
  });

  const wiki = (name, country = '') => memo(`wiki:${name}|${country}`, async () => {
    for (const title of [name, country && `${name}, ${country}`].filter(Boolean)) {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
      if (!res.ok) continue;
      const page = await res.json();
      if (page.type === 'disambiguation') continue;
      const original = page.originalimage;
      const photo = original && !/\.svg$/i.test(original.source)
        ? (original.width > 1280 && page.thumbnail ? page.thumbnail.source.replace(/\/\d+px-/, '/1280px-') : original.source)
        : null;
      return { extract: page.extract, url: page.content_urls?.desktop?.page, photo };
    }
    return null;
  });

  const country = (code) => memo(`country:${code}`, async () => {
    if (!/^[A-Z]{2}$/.test(code)) return null;
    const { data } = await getJSON('https://countries.trevorblades.com/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ country(code: "${code}") { name emoji capital currency languages { name } } }` })
    });
    return data?.country || null;
  });

  const rate = (from, to) => memo(`rate:${from}-${to}`, async () =>
    (await getJSON(`https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}`)).rate
  );

  const holidays = (code, start, end) => memo(`holidays:${code}:${start}:${end}`, async () => {
    const years = [...new Set([start.slice(0, 4), end.slice(0, 4)])];
    const lists = await Promise.all(years.map(async (year) => {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${code}`);
      if (!res.ok) return null;
      return res.status === 204 ? [] : res.json();
    }));
    if (lists.includes(null)) return null;
    return lists.flat().filter((h) => h.date >= start && h.date <= end);
  });

  async function fillCovers(client, trips) {
    let changed = false;
    for (const trip of trips.filter((t) => /wikimedia\.org.*\/1600px-/.test(t.cover_url || ''))) {
      const page = await wiki(trip.destination, trip.country || '');
      if (!page?.photo) continue;
      const { error } = await client.from('trips').update({ cover_url: page.photo }).eq('id', trip.id);
      if (error) continue;
      trip.cover_url = page.photo;
      changed = true;
    }
    return changed;
  }

  return { geocode, wiki, country, rate, holidays, fillCovers };
})();