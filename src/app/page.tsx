'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MangaCard, { MangaCardSkeleton } from '@/components/MangaCard';
import { IconFilter, IconPlay, IconSearch, IconSparkle } from '@/components/Icons';
import { MangaLibSidebar, MangaLibSortDropdown } from '@/components/catalog/MangaLibFilters';
import { SOURCE_LABELS } from '@/lib/labels';
import { getAllProgress, getLibraryItems, getReaderSettings, saveReaderSettings } from '@/lib/storage';
import { CatalogFilters, LibraryItem, SManga, SortMode, SortOrder, SourceMeta } from '@/lib/types';
import { useStored } from '@/lib/useStored';

interface BrowseResponse {
  mangas: SManga[];
  hasNextPage: boolean;
  errors?: Array<{ source: string; message: string }>;
  sources?: SourceMeta[];
}

interface CatalogState {
  key: string;
  items: SManga[];
  page: number;
  hasNext: boolean;
  loadingMore: boolean;
  error: string | null;
  errors: Array<{ source: string; message: string }>;
}

const DEFAULT_SOURCES: SourceMeta[] = [
  { id: 'all', name: 'Все источники', lang: 'ru', baseUrl: '', isOnline: true, supportsSearch: true },
  { id: 'mangalib', name: 'MangaLib', lang: 'ru', baseUrl: '', isOnline: true, supportsSearch: true },
  { id: 'remanga', name: 'ReManga', lang: 'ru', baseUrl: '', isOnline: true, supportsSearch: true },
  { id: 'comx', name: 'Com-X', lang: 'ru', baseUrl: '', isOnline: true, supportsSearch: true },
  { id: 'mangamir', name: 'MangaMir', lang: 'ru', baseUrl: '', isOnline: true, supportsSearch: true },
  { id: 'wamanga', name: 'WaManga', lang: 'ru', baseUrl: '', isOnline: true, supportsSearch: true },
  { id: 'mangadex', name: 'MangaDex', lang: 'ru/en', baseUrl: '', isOnline: true, supportsSearch: true },
];
const ADULT_SOURCE: SourceMeta = {
  id: 'manga18fx',
  name: 'Manga18fx (18+)',
  lang: 'en',
  baseUrl: '',
  isOnline: true,
  supportsSearch: true,
  isAdult: true,
};

const EMPTY_PROGRESS = {};
const EMPTY_LIBRARY: LibraryItem[] = [];
const getShowAdult = () => getReaderSettings().showAdult;

async function fetchPage(
  source: string,
  sort: SortMode,
  sortOrder: SortOrder,
  q: string,
  page: number,
  adult: boolean,
  filters: CatalogFilters,
) {
  const qs = new URLSearchParams({
    source,
    sort,
    sortOrder,
    q,
    page: String(page),
  });
  if (adult) qs.set('adult', '1');
  if (filters.types?.length) qs.set('types', filters.types.join(','));
  if (filters.formats?.length) qs.set('formats', filters.formats.join(','));
  if (filters.status?.length) qs.set('status', filters.status.join(','));
  if (filters.ageRatings?.length) qs.set('ageRatings', filters.ageRatings.join(','));
  if (filters.genres?.length) qs.set('genres', filters.genres.join(','));
  if (filters.tags?.length) qs.set('tags', filters.tags.join(','));
  if (filters.minChapters !== undefined) qs.set('minChapters', String(filters.minChapters));
  if (filters.maxChapters !== undefined) qs.set('maxChapters', String(filters.maxChapters));
  if (filters.minRating !== undefined) qs.set('minRating', String(filters.minRating));
  if (filters.maxRating !== undefined) qs.set('maxRating', String(filters.maxRating));
  if (filters.minYear !== undefined) qs.set('minYear', String(filters.minYear));
  if (filters.maxYear !== undefined) qs.set('maxYear', String(filters.maxYear));

  const res = await fetch(`/api/manga/browse?${qs}`);
  const json = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }));
  if (!res.ok || !json.success) throw new Error(json.error || `HTTP ${res.status}`);
  return json as BrowseResponse;
}

export default function HomePage() {
  const showAdult = useStored(getShowAdult, false);
  const progressMap = useStored(getAllProgress, EMPTY_PROGRESS as ReturnType<typeof getAllProgress>);
  const libraryItems = useStored(getLibraryItems, EMPTY_LIBRARY);

  const history = useMemo(
    () =>
      Object.values(progressMap)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 12),
    [progressMap],
  );

  const userListMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of libraryItems) {
      if (item?.manga?.id && item.status) {
        map[item.manga.id] = item.status;
      }
    }
    return map;
  }, [libraryItems]);

  const [source, setSource] = useState('all');
  const [sort, setSort] = useState<SortMode>('popular');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<CatalogFilters>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 400);
    return () => clearTimeout(t);
  }, [input]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (appliedFilters.genres?.length) count += appliedFilters.genres.length;
    if (appliedFilters.tags?.length) count += appliedFilters.tags.length;
    if (appliedFilters.types?.length) count += appliedFilters.types.length;
    if (appliedFilters.formats?.length) count += appliedFilters.formats.length;
    if (appliedFilters.status?.length) count += appliedFilters.status.length;
    if (appliedFilters.ageRatings?.length) count += appliedFilters.ageRatings.length;
    if (appliedFilters.myLists?.length) count += appliedFilters.myLists.length;
    if (appliedFilters.minChapters !== undefined || appliedFilters.maxChapters !== undefined) count += 1;
    if (appliedFilters.minRating !== undefined || appliedFilters.maxRating !== undefined) count += 1;
    if (appliedFilters.minYear !== undefined || appliedFilters.maxYear !== undefined) count += 1;
    return count;
  }, [appliedFilters]);

  const effectiveSource = !showAdult && source === 'manga18fx' ? 'all' : source;
  const filterKey = useMemo(() => JSON.stringify(appliedFilters), [appliedFilters]);
  const key = `${effectiveSource}|${sort}|${sortOrder}|${query}|${showAdult ? 1 : 0}|${filterKey}`;
  const [state, setState] = useState<CatalogState | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPage(effectiveSource, sort, sortOrder, query, 1, showAdult, appliedFilters)
      .then(r => {
        if (cancelled) return;
        setState({
          key,
          items: r.mangas,
          page: 1,
          hasNext: r.hasNextPage,
          loadingMore: false,
          error: null,
          errors: r.errors || [],
        });
      })
      .catch((e: Error) => {
        if (!cancelled)
          setState({ key, items: [], page: 1, hasNext: false, loadingMore: false, error: e.message, errors: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [key, effectiveSource, sort, sortOrder, query, showAdult, appliedFilters]);

  const current = state && state.key === key ? state : null;
  const loading = !current;

  const displayedItems = useMemo(() => {
    if (!current) return [];
    if (!appliedFilters.myLists || appliedFilters.myLists.length === 0) {
      return current.items;
    }
    return current.items.filter(m => {
      const st = userListMap[m.id];
      return st && appliedFilters.myLists?.includes(st);
    });
  }, [current, appliedFilters.myLists, userListMap]);

  const loadMore = useCallback(() => {
    if (!current || !current.hasNext || current.loadingMore) return;
    const nextPage = current.page + 1;
    setState(s => (s && s.key === key ? { ...s, loadingMore: true } : s));
    fetchPage(effectiveSource, sort, sortOrder, query, nextPage, showAdult, appliedFilters)
      .then(r =>
        setState(s => {
          if (!s || s.key !== key) return s;
          const seen = new Set(s.items.map(m => m.id));
          return {
            ...s,
            items: [...s.items, ...r.mangas.filter(m => !seen.has(m.id))],
            page: nextPage,
            hasNext: r.hasNextPage && r.mangas.length > 0,
            loadingMore: false,
          };
        }),
      )
      .catch(() => setState(s => (s && s.key === key ? { ...s, loadingMore: false, hasNext: false } : s)));
  }, [current, key, effectiveSource, sort, sortOrder, query, showAdult, appliedFilters]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => entries[0].isIntersecting && loadMore(), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const toggleAdult = () => {
    if (!showAdult && !window.confirm('Включить контент 18+? Подтвердите, что вам исполнилось 18 лет.')) return;
    saveReaderSettings({ showAdult: !showAdult });
  };

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters({ ...filters });
  }, [filters]);

  const handleResetFilters = useCallback(() => {
    setFilters({});
    setAppliedFilters({});
    setInput('');
    setQuery('');
    setSort('popular');
    setSortOrder('desc');
    setSource('all');
  }, []);

  const sources = showAdult ? [...DEFAULT_SOURCES, ADULT_SOURCE] : DEFAULT_SOURCES;

  return (
    <div className="container">
      <section className="hero">
        <div className="chip-wrap">
          <span className="chip chip-accent">MangaLib · ReManga · Com-X · MangaMir · MangaDex</span>
          <span className="chip chip-ai">
            <IconSparkle size={13} /> Векторный AI-оверлей
          </span>
        </div>
        <h1>
          Вся манхва и манга — <em>в одной читалке</em>
        </h1>
        <p>
          Единый каталог популярных источников с фильтрами MangaLib, библиотекой со статусами, комментариями и удобной
          читалкой без рекламы.
        </p>
        <div className="hero-actions">
          <a href="#catalog" className="btn btn-primary">
            <IconSearch size={17} /> Найти тайтл
          </a>
          <Link href="/read/demo~ai-overlay/ch-1" className="btn btn-secondary">
            <IconSparkle size={17} /> Демо AI-оверлея
          </Link>
        </div>
      </section>

      {history.length > 0 && (
        <section>
          <div className="section-head">
            <h2 className="section-title">Продолжить чтение</h2>
            <Link href="/library?tab=history" className="link-btn">
              Вся история →
            </Link>
          </div>
          <div className="continue-row">
            {history.map(h => (
              <Link key={h.mangaId} href={`/read/${h.mangaId}/${h.chapterId}`} className="continue-card">
                {h.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="thumb" src={h.coverUrl} alt="" loading="lazy" />
                ) : (
                  <div className="thumb" />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', minWidth: 0, flex: 1 }}>
                  <b
                    style={{
                      fontSize: '0.9rem',
                      lineHeight: 1.3,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h.mangaTitle || 'Без названия'}
                  </b>
                  <span
                    className="muted"
                    style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {h.chapterTitle || `Глава ${h.chapterNumber}`}
                  </span>
                  <div className="progress-bar" style={{ marginTop: 'auto' }}>
                    <div style={{ width: `${h.totalPages ? Math.round((h.pageIndex / h.totalPages) * 100) : 0}%` }} />
                  </div>
                  <span
                    className="muted"
                    style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <IconPlay size={10} /> стр. {h.pageIndex} из {h.totalPages}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section id="catalog" style={{ scrollMarginTop: 'var(--nav-h)' }}>
        <div className="filter-panel">
          <div className="filter-row" style={{ justifyContent: 'space-between' }}>
            <label className="input-icon-wrap" style={{ flex: 1, minWidth: '220px' }}>
              <IconSearch />
              <input
                type="search"
                className="input"
                placeholder="Название на русском, английском или оригинальное…"
                value={input}
                onChange={e => setInput(e.target.value)}
                aria-label="Поиск"
              />
            </label>

            <div className="catalog-controls-group">
              <MangaLibSortDropdown
                sort={sort}
                setSort={setSort}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
              />

              <button
                type="button"
                className={`ml-filter-trigger-btn ${sidebarOpen ? 'is-open' : ''} ${activeFilterCount > 0 ? 'has-active' : ''}`}
                onClick={() => setSidebarOpen(prev => !prev)}
                title="Фильтры каталога"
              >
                <IconFilter size={15} />
                <span>Фильтры</span>
                {activeFilterCount > 0 && <span className="ml-filter-badge">{activeFilterCount}</span>}
              </button>

              <button className={`switch ${showAdult ? 'on' : ''}`} onClick={toggleAdult} aria-pressed={showAdult}>
                <span className="switch-track" /> 18+
              </button>
            </div>
          </div>

          <div className="chip-row">
            {sources.map(s => (
              <button
                key={s.id}
                className={`chip ${effectiveSource === s.id ? 'active' : ''}`}
                onClick={() => setSource(s.id)}
                style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem' }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {current && current.errors.length > 0 && (effectiveSource !== 'all' || displayedItems.length === 0) && (
          <div className="notice">
            Не ответили источники: {current.errors.map(e => SOURCE_LABELS[e.source] || e.source).join(', ')}. Показаны
            результаты остальных.
          </div>
        )}

        <div className="catalog-layout">
          <div className="catalog-content">
            {loading ? (
              <div className="manga-grid">
                {Array.from({ length: 18 }, (_, i) => (
                  <MangaCardSkeleton key={i} />
                ))}
              </div>
            ) : current.error ? (
              <div className="empty-state">
                <h3>Источник недоступен</h3>
                <p style={{ marginBottom: '1.25rem' }}>{current.error}</p>
                <button className="btn btn-secondary btn-sm" onClick={() => setSource('all')}>
                  Показать все источники
                </button>
              </div>
            ) : displayedItems.length === 0 ? (
              <div className="empty-state">
                <h3>Ничего не найдено</h3>
                <p style={{ marginBottom: '1.25rem' }}>Попробуйте другое название или сбросить фильтры</p>
                <button className="btn btn-secondary btn-sm" onClick={handleResetFilters}>
                  Сбросить фильтры
                </button>
              </div>
            ) : (
              <>
                <div className="manga-grid">
                  {displayedItems.map((m, i) => (
                    <MangaCard
                      key={m.id}
                      manga={m}
                      eager={i < 12}
                      userListStatus={userListMap[m.id]}
                    />
                  ))}
                  {current.loadingMore && Array.from({ length: 6 }, (_, i) => <MangaCardSkeleton key={`s${i}`} />)}
                </div>
                <div ref={sentinel} style={{ height: 1 }} />
                {current.hasNext && !current.loadingMore && (
                  <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                    <button className="btn btn-secondary" onClick={loadMore}>
                      Показать ещё
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <MangaLibSidebar
            filters={filters}
            setFilters={setFilters}
            onApply={handleApplyFilters}
            onReset={handleResetFilters}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
          />
        </div>
      </section>
    </div>
  );
}
