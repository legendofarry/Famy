import type { LinkPreview } from '../src/shared/types.ts';

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractMetaTag(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, 'i'),
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }
  return null;
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview> {
  const parsed = new URL(rawUrl);
  const domain = parsed.hostname.replace(/^www\./, '');
  const fallback: LinkPreview = {
    url: parsed.href,
    title: domain,
    description: parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : parsed.href,
    domain,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(parsed.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FamyLinkPreview/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('text/html')) {
      return fallback;
    }

    const html = (await res.text()).slice(0, 64000);
    const ogTitle = extractMetaTag(html, 'og:title') || extractMetaTag(html, 'twitter:title');
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const ogDesc =
      extractMetaTag(html, 'og:description') ||
      extractMetaTag(html, 'description') ||
      extractMetaTag(html, 'twitter:description');

    return {
      url: parsed.href,
      title: (ogTitle || (titleTag ? decodeHtmlEntities(titleTag) : '') || domain).slice(0, 140),
      description: (ogDesc || fallback.description).slice(0, 220),
      domain,
    };
  } catch {
    return fallback;
  }
}
