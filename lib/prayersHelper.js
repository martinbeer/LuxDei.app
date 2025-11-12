import { prayerCategories, prayers as hardcodedPrayers } from '../data/prayers';

/**
 * Get all categories and prayers (hardcoded only)
 */
export async function loadCategoriesAndPrayers() {
  const categories = prayerCategories
    .filter((c) => c.id !== 'all')
    .map(({ id, name }) => ({ id, name }));
  
  const prayers = hardcodedPrayers.map((p) => ({
    id: p.id,
    title: p.title,
    text: p.text,
    category: p.category,
    slug: p.id,
  }));
  
  return { categories, prayers };
}

/**
 * Get a single prayer detail (hardcoded only)
 */
export async function loadPrayerDetail({ id, slug }) {
  const prayer = hardcodedPrayers.find((p) => p.id === id || p.id === slug);
  
  if (!prayer) return null;
  
  return {
    id: prayer.id,
    title: prayer.title,
    text: prayer.text,
    category: prayer.category,
    slug: prayer.id,
  };
}
