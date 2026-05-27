import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo/metadata';

/**
 * robots.txt — allow the public marketing surface, disallow everything
 * that's either private (dashboard/admin/api) or per-tenant and not
 * meant for the index (talk widgets, embed harness).
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/admin/', '/api/', '/talk/', '/embed-test/'],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
