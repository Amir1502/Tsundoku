import { MangaListResult, Page, SChapter, SManga, SortMode, SortOrder, SourceMeta } from '../types';
import { ID_SEPARATOR, MangaSource } from './base';
import { DEMO_SLUG, LEGACY_DEMO_IDS, demoSource } from './demo';
import { SourceError } from './http';
import { comxSource } from './comx';
import { manga18fxSource } from './manga18fx';
import { mangadexSource } from './mangadex';
import { mangalibSource } from './mangalib';
import { mangamirSource } from './mangamir';
import { remangaSource } from './remanga';
import { wamangaSource } from './wamanga';

export const SOURCES: Record<string, MangaSource> = {
  mangalib: mangalibSource,
  remanga: remangaSource,
  mangamir: mangamirSource,
  wamanga: wamangaSource,
  comx: comxSource,
  mangadex: mangadexSource,
  manga18fx: manga18fxSource,
  demo: demoSource,
};

export const ALL_SOURCE_META: SourceMeta = {
  id: 'all',
  name: 'Все источники',
  lang: 'ru',
  baseUrl: '',
  isOnline: true,
  supportsSearch: true,
};

export function listSources(includeAdult = false): SourceMeta[] {
  return [
    ALL_SOURCE_META,
    ...Object.values(SOURCES)
      .map(s => s.meta)
      .filter(m => m.id !== 'demo' && (includeAdult || !m.isAdult)),
  ];
}

export function getSource(id: string): MangaSource {
  const src = SOURCES[id];
  if (!src) throw new SourceError(`Неизвестный источник: ${id}`, 404);
  return src;
}

/** Resolves a global manga id (incl. legacy `md-<uuid>` and old curated ids) into source + slug. */
export function parseMangaId(rawId: string): { source: MangaSource; slug: string } {
  const id = decodeURIComponent(rawId);
  const sep = id.indexOf(ID_SEPARATOR);
  if (sep > 0) return { source: getSource(id.slice(0, sep)), slug: id.slice(sep + 1) };
  if (id.startsWith('md-')) return { source: mangadexSource, slug: id.slice(3) };
  if (LEGACY_DEMO_IDS.includes(id) || id === DEMO_SLUG) return { source: demoSource, slug: DEMO_SLUG };
  throw new SourceError('Тайтл не найден', 404);
}

function normalizeChapterId(rawId: string): string {
  const id = decodeURIComponent(rawId);
  return id.startsWith('md-ch-') ? id.slice(6) : id;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new SourceError(`${label}: таймаут`)), ms);
    p.then(
      v => {
        clearTimeout(t);
        resolve(v);
      },
      e => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s\-_:!?,.()'"«»—–\/\\]+/g, '')
    .trim();
}

export interface BrowseParams {
  source?: string;
  query?: string;
  page?: number;
  sort?: SortMode;
  sortOrder?: SortOrder;
  adult?: boolean;
  types?: string[];
  formats?: string[];
  status?: string[];
  translationStatus?: string[];
  genres?: string[];
  tags?: string[];
  ageRatings?: string[];
  minChapters?: number;
  maxChapters?: number;
  minYear?: number;
  maxYear?: number;
  minRating?: number;
  maxRating?: number;
  removeEmptyChapters?: boolean;
  deduplicate?: boolean;
}

export interface BrowseResult extends MangaListResult {
  errors: Array<{ source: string; message: string }>;
}

export async function browse({
  source = 'all',
  query = '',
  page = 1,
  sort = 'popular',
  sortOrder = 'desc',
  adult = false,
  types,
  status,
  ageRatings,
  genres,
  tags,
  minChapters,
  maxChapters,
  minYear,
  maxYear,
  minRating,
  maxRating,
  removeEmptyChapters = true,
  deduplicate = true,
}: BrowseParams): Promise<BrowseResult> {
  const q = query.trim();
  const targets =
    source === 'all'
      ? Object.values(SOURCES).filter(s => s.meta.id !== 'demo' && (adult || !s.meta.isAdult))
      : [getSource(source)];

  if (!adult && targets.some(t => t.meta.isAdult)) {
    throw new SourceError('Источник 18+ доступен только после включения взрослого контента', 403);
  }

  const settled = await Promise.allSettled(
    targets.map(s =>
      withTimeout(q ? s.search(q, page) : s.list(sort, page), source === 'all' ? 9000 : 15000, s.meta.name),
    ),
  );

  const lists: SManga[][] = [];
  const errors: BrowseResult['errors'] = [];
  let hasNextPage = false;
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      lists.push(r.value.items.filter(m => adult || !m.isAdult));
      hasNextPage ||= r.value.hasNextPage;
    } else {
      errors.push({
        source: targets[i].meta.id,
        message: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });

  // Round-robin merge, deduplicate identical titles, and exclude titles with zero chapters
  let items: SManga[] = [];
  const seenId = new Set<string>();
  const seenTitleMap = new Map<string, number>();

  for (let i = 0; lists.some(l => i < l.length); i++) {
    for (const l of lists) {
      const m = l[i];
      if (!m || seenId.has(m.id)) continue;

      // Filter out zero-chapter titles if known
      if (removeEmptyChapters && m.totalChapters === 0) {
        continue;
      }

      seenId.add(m.id);

      const normTitle = normalizeTitleKey(m.title);
      if (deduplicate && normTitle.length >= 2) {
        const existingIdx = seenTitleMap.get(normTitle);
        if (existingIdx !== undefined) {
          const existing = items[existingIdx];
          const existingCh = existing.totalChapters ?? 0;
          const newCh = m.totalChapters ?? 0;
          // If existing had 0 chapters and new one has chapters, replace it!
          if (existingCh === 0 && newCh > 0) {
            items[existingIdx] = m;
          } else if (newCh > existingCh && m.rating >= (existing.rating || 0)) {
            items[existingIdx] = m;
          }
          continue; // skip duplicate
        }
        seenTitleMap.set(normTitle, items.length);
      }

      items.push(m);
    }
  }

  // Filter by Type (Манхва, Манга, Маньхуа, Руманга, etc.)
  if (types && types.length > 0) {
    const lowerTypes = types.map(t => t.toLowerCase());
    items = items.filter(m => {
      const mt = (m.type || '').toLowerCase();
      return lowerTypes.some(t => mt.includes(t) || t.includes(mt));
    });
  }

  // Filter by Status (ONGOING, COMPLETED, etc.)
  if (status && status.length > 0) {
    items = items.filter(m => status.includes(m.status));
  }

  // Filter by Age Rating (6+, 12+, 16+, 18+)
  if (ageRatings && ageRatings.length > 0) {
    items = items.filter(m => m.ageRating && ageRatings.includes(m.ageRating));
  }

  // Filter by Chapter Count
  if (minChapters !== undefined && !Number.isNaN(minChapters)) {
    items = items.filter(m => (m.totalChapters ?? 0) >= minChapters);
  }
  if (maxChapters !== undefined && !Number.isNaN(maxChapters)) {
    items = items.filter(m => (m.totalChapters ?? 0) <= maxChapters);
  }

  // Filter by Rating (0..10)
  if (minRating !== undefined && !Number.isNaN(minRating)) {
    items = items.filter(m => m.rating >= minRating);
  }
  if (maxRating !== undefined && !Number.isNaN(maxRating)) {
    items = items.filter(m => m.rating <= maxRating);
  }

  // Filter by Year
  if (minYear !== undefined && !Number.isNaN(minYear)) {
    items = items.filter(m => (m.releaseYear ?? 0) >= minYear);
  }
  if (maxYear !== undefined && !Number.isNaN(maxYear)) {
    items = items.filter(m => (m.releaseYear ?? 0) <= maxYear);
  }

  // Filter by Genres
  if (genres && genres.length > 0) {
    const lowerGenres = genres.map(g => g.toLowerCase());
    items = items.filter(m =>
      lowerGenres.every(g => m.genres.some(mg => mg.toLowerCase().includes(g))),
    );
  }

  // Filter by Tags
  if (tags && tags.length > 0) {
    const lowerTags = tags.map(t => t.toLowerCase());
    items = items.filter(m =>
      lowerTags.some(t => m.genres.some(mg => mg.toLowerCase().includes(t))),
    );
  }

  // Sorting
  if (sort === 'rating') {
    items.sort((a, b) => b.rating - a.rating);
  } else if (sort === 'chapters') {
    items.sort((a, b) => (b.totalChapters ?? 0) - (a.totalChapters ?? 0));
  } else if (sort === 'name_asc') {
    items.sort((a, b) => a.title.localeCompare(b.title, 'en'));
  } else if (sort === 'name_ru_asc') {
    items.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  } else if (sort === 'release_date') {
    items.sort((a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0));
  }

  if (sortOrder === 'asc' && (sort === 'rating' || sort === 'chapters' || sort === 'release_date')) {
    items.reverse();
  } else if (sortOrder === 'desc' && (sort === 'name_asc' || sort === 'name_ru_asc')) {
    items.reverse();
  }

  if (errors.length === targets.length && targets.length > 0) {
    throw new SourceError(errors.map(e => `${e.source}: ${e.message}`).join('; '), 502);
  }
  return { items, hasNextPage, errors };
}

export async function getMangaById(id: string): Promise<SManga | null> {
  try {
    const { source, slug } = parseMangaId(id);
    return await source.details(slug);
  } catch (err) {
    if (err instanceof SourceError && err.status === 404) return null;
    throw err;
  }
}

export async function getMangaChapters(id: string): Promise<SChapter[]> {
  const { source, slug } = parseMangaId(id);
  return source.chapters(slug);
}

export async function getChapterPages(mangaId: string, chapterId: string): Promise<Page[]> {
  const { source, slug } = parseMangaId(mangaId);
  return source.pages(slug, normalizeChapterId(chapterId));
}

/** Chapters are newest-first: "next" is the newer one (lower index). */
export function findNeighbours(chapters: SChapter[], chapterId: string) {
  const id = normalizeChapterId(chapterId);
  const idx = chapters.findIndex(c => c.id === id);
  return {
    current: idx >= 0 ? chapters[idx] : null,
    next: idx > 0 ? chapters[idx - 1] : null,
    prev: idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null,
  };
}

export function isAllowedImageHost(sourceId: string, host: string): MangaSource | null {
  const src = SOURCES[sourceId];
  if (!src) return null;
  return src.imageHosts.some(re => re.test(host)) ? src : null;
}

export { SourceError };
