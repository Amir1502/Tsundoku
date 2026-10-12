import { MangaListResult, Page, SChapter, SManga, SortMode } from '../types';
import { MangaSource, makeMangaId, proxied } from './base';
import { SourceError, cached, cleanText, getJson, getText, toIsoDate } from './http';

const SITE = 'https://wamanga.ru';
const API = `${SITE}/api/v1`;
const HEADERS = { Referer: `${SITE}/`, Origin: SITE };
const PAGE_SIZE = 30;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface WamangaManga {
  id: string;
  slug: string;
  year?: number;
  title: string;
  titleEnglish?: string;
  alternateTitles?: string[];
  genres?: string[];
  description?: string;
  authors?: string[];
  artists?: string[];
  publishers?: string[];
  imageUrl?: string;
  coverUrl?: string;
  updatedAt?: string;
  createdAt?: string;
  hidden?: boolean;
  licensed?: boolean;
  isAdult?: boolean;
  type?: string;
  statusTitle?: string;
  translationStatus?: string;
  pegiRating?: string;
  likes?: number;
  views?: number;
}

export interface WamangaChapterItem {
  id: string;
  title?: string;
  slug?: string;
  position: number;
  isProcessing?: boolean;
  totalFilesExpected?: number;
  processedFilesCount?: number;
  views?: number;
  createdAt?: string;
  updatedAt?: string;
  likesCount?: number;
}

export interface WamangaChapterDetails {
  id: string;
  title?: string;
  slug?: string;
  position: number;
  files?: Array<{
    id: string;
    diskFile: string;
    position: string | number;
  }>;
}

const STATUS_MAP: Record<string, SManga['status']> = {
  ongoing: 'ONGOING',
  completed: 'COMPLETED',
  hiatus: 'HIATUS',
  cancelled: 'CANCELLED',
};

const TYPE_MAP: Record<string, string> = {
  manhwa: 'Манхва',
  manga: 'Манга',
  manhua: 'Маньхуа',
};

function absUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function parseWamangaTitle(t: WamangaManga): SManga {
  const typeName = t.type ? TYPE_MAP[t.type.toLowerCase()] || t.type : undefined;
  const status = STATUS_MAP[(t.statusTitle || '').toLowerCase()] || 'UNKNOWN';
  const ageRating = t.pegiRating || (t.isAdult ? '18+' : undefined);
  const isAdult = Boolean(t.isAdult || ageRating === '18+');
  const authors = Array.from(
    new Set(
      [...(t.authors || []), ...(t.artists || []), ...(t.publishers || [])]
        .map(a => (a || '').trim())
        .filter(Boolean)
        .filter(a => a !== 'N/A'),
    ),
  );

  return {
    id: makeMangaId('wamanga', t.id),
    sourceId: 'wamanga',
    title: t.title || t.slug,
    altTitle: t.titleEnglish || t.alternateTitles?.[0] || undefined,
    description: cleanText(t.description),
    coverUrl: proxied(absUrl(t.coverUrl || t.imageUrl), 'wamanga'),
    authors,
    status,
    rating: 0,
    genres: Array.isArray(t.genres) ? t.genres.filter(Boolean) : [],
    type: typeName,
    ageRating,
    isAdult,
    releaseYear: t.year || undefined,
    translationStatus: t.translationStatus || undefined,
    lastUpdated: toIsoDate(t.updatedAt || t.createdAt),
    views: typeof t.views === 'number' ? t.views : undefined,
    sourceUrl: `${SITE}/${t.type || 'manga'}/${t.slug}`,
  };
}

export function parseWamangaChapters(mangaId: string, list: WamangaChapterItem[]): SChapter[] {
  return [...list]
    .sort((a, b) => b.position - a.position)
    .map(c => ({
      id: c.id,
      mangaId,
      sourceId: 'wamanga',
      number: c.position,
      title: c.title ? `Глава ${c.position}: ${c.title}` : `Глава ${c.position}`,
      releaseDate: toIsoDate(c.createdAt || c.updatedAt),
      pagesCount: c.processedFilesCount || c.totalFilesExpected || undefined,
    }));
}

export function parseWamangaPages(details: WamangaChapterDetails): Page[] {
  const files = details.files || [];
  if (files.length === 0) {
    throw new SourceError('Страницы главы не найдены', 404);
  }
  return [...files]
    .sort((a, b) => (parseFloat(String(a.position)) || 0) - (parseFloat(String(b.position)) || 0))
    .map((f, i) => ({
      index: i + 1,
      imageUrl: proxied(absUrl(f.diskFile), 'wamanga'),
    }));
}

async function resolveUuid(slug: string): Promise<string> {
  if (UUID_REGEX.test(slug)) return slug;

  return cached(`wm:slug2id:${slug}`, 30 * 60_000, async () => {
    // 1. Try querying /api/v1/manga?query=slug
    try {
      const searchItems = await getJson<WamangaManga[]>(`${API}/manga?query=${encodeURIComponent(slug)}&limit=10`, {
        headers: HEADERS,
      });
      if (Array.isArray(searchItems)) {
        const found = searchItems.find(m => m.slug === slug || m.id === slug);
        if (found?.id) return found.id;
      }
    } catch {}

    // 2. Try fetching HTML pages for possible prefixes
    const prefixes = ['manhwa', 'manga', 'manhua'];
    for (const prefix of prefixes) {
      try {
        const html = await getText(`${SITE}/${prefix}/${encodeURIComponent(slug)}`, { headers: HEADERS });
        const m = html.match(/manga:\s*\{[^}]*id:\s*"([0-9a-f-]{36})"/i);
        if (m?.[1]) return m[1];
        const m2 = html.match(new RegExp(`id:"([0-9a-f-]{36})"[^}]*slug:"${slug}"`));
        if (m2?.[1]) return m2[1];
      } catch {}
    }

    throw new SourceError('Тайтл не найден на WaManga', 404);
  });
}

export const wamangaSource: MangaSource = {
  meta: {
    id: 'wamanga',
    name: 'WaManga',
    lang: 'ru',
    baseUrl: SITE,
    isOnline: true,
    supportsSearch: true,
    note: 'Оригинальные переводы манхвы и маньхуа.',
  },
  imageReferer: `${SITE}/`,
  imageHosts: [/(^|\.)wamanga\.ru$/],

  async list(sort: SortMode, page: number): Promise<MangaListResult> {
    let sortKey = 'views';
    let sortDescending = true;

    if (sort === 'latest' || sort === 'created' || sort === 'release_date') {
      sortKey = 'updatedAt';
      sortDescending = true;
    } else if (sort === 'rating') {
      sortKey = 'likes';
      sortDescending = true;
    } else if (sort === 'name_asc' || sort === 'name_ru_asc') {
      sortKey = 'alphabetical';
      sortDescending = false;
    } else if (sort === 'popular' || sort === 'views' || sort === 'chapters') {
      sortKey = 'views';
      sortDescending = true;
    }

    const offset = Math.max(0, (page - 1) * PAGE_SIZE);
    const qs = new URLSearchParams({
      sortKey,
      sortDescending: String(sortDescending),
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });

    const list = await getJson<WamangaManga[]>(`${API}/manga?${qs}`, { headers: HEADERS });
    const items = (Array.isArray(list) ? list : []).filter(t => t && t.id).map(parseWamangaTitle);
    return { items, hasNextPage: items.length >= PAGE_SIZE };
  },

  async search(query: string, page: number): Promise<MangaListResult> {
    const q = query.trim();
    if (!q) return this.list('popular', page);

    const offset = Math.max(0, (page - 1) * PAGE_SIZE);
    const qs = new URLSearchParams({
      query: q,
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });

    const list = await getJson<WamangaManga[]>(`${API}/manga?${qs}`, { headers: HEADERS });
    const items = (Array.isArray(list) ? list : []).filter(t => t && t.id).map(parseWamangaTitle);
    return { items, hasNextPage: items.length >= PAGE_SIZE };
  },

  async details(slug: string): Promise<SManga> {
    const uuid = await resolveUuid(slug);
    return cached(`wm:det:${uuid}`, 10 * 60_000, async () => {
      const [rawManga, chs] = await Promise.all([
        getJson<WamangaManga>(`${API}/manga/${encodeURIComponent(uuid)}`, { headers: HEADERS }),
        wamangaSource.chapters(uuid).catch(() => [] as SChapter[]),
      ]);
      if (!rawManga?.id) throw new SourceError('Тайтл не найден на WaManga', 404);
      const m = parseWamangaTitle(rawManga);
      m.totalChapters = chs.length;
      return m;
    });
  },

  async chapters(slug: string): Promise<SChapter[]> {
    const uuid = await resolveUuid(slug);
    return cached(`wm:ch:${uuid}`, 5 * 60_000, async () => {
      const list = await getJson<WamangaChapterItem[]>(`${API}/manga/${encodeURIComponent(uuid)}/chapters`, {
        headers: HEADERS,
      });
      if (!Array.isArray(list)) return [];
      return parseWamangaChapters(makeMangaId('wamanga', uuid), list);
    });
  },

  async pages(_slug: string, chapterId: string): Promise<Page[]> {
    const data = await getJson<WamangaChapterDetails>(`${API}/chapters/${encodeURIComponent(chapterId)}`, {
      headers: HEADERS,
    });
    return parseWamangaPages(data);
  },
};
