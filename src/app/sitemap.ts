import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo/metadata';

/**
 * sitemap.xml — only the public marketing routes. Dashboard, auth, and
 * per-tenant talk pages are deliberately excluded (also blocked in
 * robots.ts).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  const routes: Array<{ path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
    { path: '/', priority: 1, freq: 'weekly' },
    { path: '/pricing', priority: 0.8, freq: 'weekly' },
    { path: '/legal/terms', priority: 0.3, freq: 'yearly' },
    { path: '/legal/privacy', priority: 0.3, freq: 'yearly' },
  ];
  return routes.map((r) => ({
    url: r.path === '/' ? base : `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));
}
