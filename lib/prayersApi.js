import Constants from 'expo-constants';
import { prayerCategories, prayers as hardcodedPrayers } from '../data/prayers';

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function mapPrayer(item, catId) {
  const a = item?.attributes || {};
  const id = item?.id ?? a?.id ?? a?.slug ?? slugify(a?.title || a?.name || 'gebet');
  const title = a?.title || a?.name || item?.title || 'Gebet';
  const text = a?.text || a?.content || a?.body || item?.text || '';
  const slug = a?.slug || a?.key || item?.slug;
  return { id: String(id), slug: slug || String(id), title, text, category: catId };
}

function mapCategory(item) {
  const a = item?.attributes || {};
  const name = a?.name || a?.title || item?.name || 'Kategorie';
  const id = a?.slug || slugify(name) || String(item?.id ?? name);
  const prayersRel = a?.prayers?.data || item?.prayers || [];
  const prayers = Array.isArray(prayersRel) ? prayersRel.map((p) => mapPrayer(p, id)) : [];
  return { id, name, prayers };
}

function withParams(base, params) {
  try {
    const u = new URL(base);
    const sp = new URLSearchParams(u.search);
    Object.entries(params).forEach(([k, v]) => sp.set(k, v));
    u.search = sp.toString();
    return u.toString();
  } catch {
    const join = base.includes('?') ? '&' : '?';
    const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    return `${base}${join}${qs}`;
  }
}

function toPrayersEndpoint(categoriesUrl) {
  try {
    const u = new URL(categoriesUrl);
    u.pathname = u.pathname.replace(/prayer-categories?\/?$/, 'prayers');
    return u.toString();
  } catch {
    return categoriesUrl.replace(/prayer-categories?\/?$/, 'prayers');
  }
}

export async function loadCategoriesAndPrayers() {
  const extra = Constants?.expoConfig?.extra || Constants?.manifest?.extra || {};
  const categoriesUrl = extra.gebeteURL;
  if (!categoriesUrl) {
    return { categories: [], prayers: [] };
  }
  try {
    // If user already provided filters/populate/locale in URL, don't override; otherwise add safe defaults
    const hasQuery = categoriesUrl.includes('?');
    let url = hasQuery
      ? categoriesUrl
      : withParams(categoriesUrl, {
          'populate[prayers]': '*',
          'pagination[pageSize]': '100',
          'sort[0]': 'name:asc',
          ...(extra.gebeteLocale ? { locale: String(extra.gebeteLocale) } : {}),
        });
    let res, json, raw;
    try {
      res = await fetch(url);
      json = await res.json();
      raw = Array.isArray(json) ? json : (json?.data || []);
    } catch (e) {
      console.warn('[prayersApi] categories fetch failed:', e?.message || e);
      raw = [];
    }
    // If empty, try adding locale=de as a safe fallback (common Strapi i18n setup)
    if ((!raw || raw.length === 0) && !hasQuery && !String(url).includes('locale=')) {
      const urlWithDe = withParams(categoriesUrl, {
        'populate[prayers]': '*',
        'pagination[pageSize]': '100',
        'sort[0]': 'name:asc',
        locale: 'de',
      });
      try {
        const r2 = await fetch(urlWithDe);
        const j2 = await r2.json();
        raw = Array.isArray(j2) ? j2 : (j2?.data || []);
        url = urlWithDe;
      } catch (e2) {
        console.warn('[prayersApi] categories fetch (locale=de) failed:', e2?.message || e2);
      }
    }
    const cats = (raw || []).map(mapCategory);
    let categories = cats
      .filter((c) => !/^alle$/i.test(c.name) && !/^rosenkranz$/i.test(c.name))
      .map(({ id, name }) => ({ id, name }));
    let prayers = cats.flatMap((c) => c.prayers.map((p) => ({ ...p, category: c.id })));
    console.log('[prayersApi] categories url:', url, '-> cats:', cats.length, 'prayers (embedded):', prayers.length);

    // Fallback: if no prayers were embedded, fetch from /prayers and map relation
    if (!prayers.length) {
      const basePrayers = toPrayersEndpoint(categoriesUrl);
      const prayersUrl = basePrayers.includes('?')
        ? basePrayers
        : withParams(basePrayers, {
            populate: '*',
            'pagination[pageSize]': '1000',
            'sort[0]': 'title:asc',
            ...(extra.gebeteLocale ? { locale: String(extra.gebeteLocale) } : {}),
          });
      let pdata = [];
      try {
        const pr = await fetch(prayersUrl);
        const pj = await pr.json();
        pdata = Array.isArray(pj) ? pj : (pj?.data || []);
      } catch (e) {
        console.warn('[prayersApi] prayers fetch failed:', e?.message || e);
        pdata = [];
      }
      const pcatsById = new Map(cats.map((c) => [c.id, c.name]));
      prayers = pdata.map((item) => {
        const a = item?.attributes || {};
        const catRel = a?.category?.data || a?.prayer_category?.data || a?.prayerCategory?.data || null;
        const catId = catRel ? (catRel?.attributes?.slug || String(catRel?.id)) : undefined;
        // If slug missing, try name->slug
        const cid = catId || (a?.category?.data?.attributes?.name ? slugify(a.category.data.attributes.name) : undefined);
        return mapPrayer(item, cid || 'other');
      });
      // If categories were empty (no names), build from prayers relations
      if (!categories.length) {
        const set = new Map();
        for (const p of prayers) {
          if (!set.has(p.category)) set.set(p.category, p.category);
        }
        categories = Array.from(set.keys()).map((id) => ({ id, name: id }));
        categories = categories.filter((c) => !/^alle$/i.test(c.name) && !/^rosenkranz$/i.test(c.name));
      }
      console.log('[prayersApi] prayers url:', prayersUrl, '-> prayers:', prayers.length, 'derived categories:', categories.length);
    }

    // Absolute last-resort: if both categories and prayers are empty, try to derive by fetching prayers without populate
    if (!categories.length && !prayers.length) {
      try {
        const basePrayers = toPrayersEndpoint(categoriesUrl);
        const url2 = basePrayers.includes('?') ? basePrayers : withParams(basePrayers, { 'pagination[pageSize]': '1000' });
        const r = await fetch(url2);
        const j = await r.json();
        const data = Array.isArray(j) ? j : (j?.data || []);
        prayers = data.map((item) => mapPrayer(item, undefined));
        const uniq = new Map();
        for (const p of prayers) {
          const id = p.category || 'other';
          if (!uniq.has(id)) uniq.set(id, { id, name: id });
        }
        categories = Array.from(uniq.values()).filter((c) => !/^alle$/i.test(c.name) && !/^rosenkranz$/i.test(c.name));
        console.log('[prayersApi] last-resort from prayers (no populate):', { prayers: prayers.length, categories: categories.length });
      } catch (e) {
        console.warn('[prayersApi] last-resort fetch failed:', e?.message || e);
      }
    }

    return { categories, prayers };
  } catch (e) {
    console.warn('[prayersApi] Fallback to hardcoded prayers:', e?.message || e);
    // Fallback: use hardcoded prayers from data/prayers.js
    const fallbackCategories = prayerCategories
      .filter((c) => c.id !== 'all')
      .map(({ id, name }) => ({ id, name }));
    const fallbackPrayers = hardcodedPrayers.map((p) => ({
      id: p.id,
      title: p.title,
      text: p.text,
      category: p.category,
      slug: p.id,
    }));
    console.log('[prayersApi] Using hardcoded prayers:', { categories: fallbackCategories.length, prayers: fallbackPrayers.length });
    return { categories: fallbackCategories, prayers: fallbackPrayers };
  }
}

export async function loadPrayerDetail({ id, slug }) {
  const extra = Constants?.expoConfig?.extra || Constants?.manifest?.extra || {};
  const categoriesUrl = extra.gebeteURL;
  
  // First, try to load from hardcoded prayers
  const hardcodedPrayer = hardcodedPrayers.find(
    (p) => p.id === id || p.id === slug
  );
  if (hardcodedPrayer) {
    return {
      id: hardcodedPrayer.id,
      title: hardcodedPrayer.title,
      text: hardcodedPrayer.text,
      category: hardcodedPrayer.category,
      slug: hardcodedPrayer.id,
    };
  }
  
  if (!categoriesUrl) return null;
  const basePrayers = toPrayersEndpoint(categoriesUrl);
  const params = slug
    ? { 'filters[slug][$eq]': slug }
    : { 'filters[id][$eq]': String(id) };
  const url = withParams(basePrayers, {
    populate: '*',
    'pagination[pageSize]': '1',
    ...params,
    ...(extra.gebeteLocale ? { locale: String(extra.gebeteLocale) } : {}),
  });
  try {
    const res = await fetch(url);
    const json = await res.json();
    const item = Array.isArray(json?.data) ? json.data[0] : null;
    if (!item) return null;
    return mapPrayer(item, undefined);
  } catch {
    return null;
  }
}
