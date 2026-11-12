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

  const skipPlace = /^(capital |highly urbanized |component |independent )?(city|province|municipality|town|village|barangay|district|region|neighbou?rhood|suburb|island group)\b|\b(school|university|college|hospital|company|station|road|street|highway|electoral|census|subdivision)\b/i;

  const nearby = (lat, lng, radius = 5000) => memo(`nearby:${lat.toFixed(4)},${lng.toFixed(4)}:${radius}`, async () => {
    const params = new URLSearchParams({
      action: 'query', generator: 'geosearch', ggscoord: `${lat}|${lng}`, ggsradius: radius, ggslimit: 50,
      prop: 'coordinates|pageimages|description|info', piprop: 'thumbnail', pithumbsize: 500, inprop: 'url',
      format: 'json', origin: '*'
    });
    const { query } = await getJSON(`https://en.wikipedia.org/w/api.php?${params}`);
    return Object.values(query?.pages || {})
      .filter((p) => p.coordinates && !skipPlace.test(p.description || ''))
      .map((p) => ({
        id: p.pageid, name: p.title, description: p.description || '', photo: p.thumbnail?.source || null,
        url: p.fullurl, lat: p.coordinates[0].lat, lng: p.coordinates[0].lon
      }));
  });

  const findPlace = (q) => memo(`find:${q}`, async () =>
    (await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`))
      .map((r) => ({ name: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }))
  );

  const ENGLISH = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];

  function englishLabels(gl) {
    gl.getStyle().layers.forEach((layer) => {
      if (layer.type !== 'symbol') return;
      const field = gl.getLayoutProperty(layer.id, 'text-field');
      if (field && JSON.stringify(field).includes('name')) gl.setLayoutProperty(layer.id, 'text-field', ENGLISH);
    });
  }

  function addBaseMap(map) {
    if (window.maplibregl && L.maplibreGL) {
      let layer = null;
      try {
        layer = L.maplibreGL({
          style: 'https://tiles.openfreemap.org/styles/liberty',
          attribution: '&copy; <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> &copy; OpenStreetMap'
        });
        layer.addTo(map);
        const gl = layer.getMaplibreMap();
        if (gl.isStyleLoaded()) englishLabels(gl);
        else gl.once('load', () => englishLabels(gl));
        return layer;
      } catch (error) {
        console.error('English map unavailable, using standard map:', error);
        if (layer) map.removeLayer(layer);
      }
    }
    return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
  }

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

  return { geocode, wiki, country, rate, holidays, nearby, findPlace, fillCovers, addBaseMap };
})();