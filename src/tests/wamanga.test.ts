import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parseWamangaChapters,
  parseWamangaPages,
  parseWamangaTitle,
  wamangaSource,
  WamangaChapterDetails,
  WamangaChapterItem,
  WamangaManga,
} from '../lib/sources/wamanga';
import { isAllowedImageHost, parseMangaId } from '../lib/sources/index';
import { SourceError } from '../lib/sources/http';

describe('WaManga parser', () => {
  it('parses manga details accurately', () => {
    const raw: WamangaManga = {
      id: '5cba84f3-905d-4fec-ab16-9db5873da234',
      slug: 'edinstvennaya-vnuchka-silneyshego-gercoga',
      year: 2026,
      title: 'Единственная внучка сильнейшего герцога',
      titleEnglish: 'Choegangja Gongjaknimui Hanappunin Sonnyeottarimnida',
      alternateTitles: ['최강자 공작님의 하나뿐인 손녀딸입니다'],
      genres: ['Сёдзё', 'Драма', 'Романтика'],
      description: 'Господи, пожалуйста, позволь мне и сегодня благородно помешать его торговле.',
      authors: ['Author One', 'N/A'],
      artists: ['Artist One'],
      publishers: ['Publisher A'],
      imageUrl: '/app/uploads/banner.webp',
      coverUrl: '/app/uploads/cover.webp',
      type: 'manhwa',
      statusTitle: 'ongoing',
      translationStatus: 'ongoing',
      pegiRating: '16+',
      likes: 12,
      views: 5319,
    };

    const manga = parseWamangaTitle(raw);

    assert.strictEqual(manga.id, 'wamanga~5cba84f3-905d-4fec-ab16-9db5873da234');
    assert.strictEqual(manga.sourceId, 'wamanga');
    assert.strictEqual(manga.title, 'Единственная внучка сильнейшего герцога');
    assert.strictEqual(manga.altTitle, 'Choegangja Gongjaknimui Hanappunin Sonnyeottarimnida');
    assert.strictEqual(manga.type, 'Манхва');
    assert.strictEqual(manga.status, 'ONGOING');
    assert.strictEqual(manga.ageRating, '16+');
    assert.strictEqual(manga.isAdult, false);
    assert.strictEqual(manga.releaseYear, 2026);
    assert.strictEqual(manga.views, 5319);
    assert.deepStrictEqual(manga.genres, ['Сёдзё', 'Драма', 'Романтика']);
    assert.deepStrictEqual(manga.authors, ['Author One', 'Artist One', 'Publisher A']);
    assert.ok(decodeURIComponent(manga.coverUrl).includes('https://wamanga.ru/app/uploads/cover.webp'));
    assert.strictEqual(manga.sourceUrl, 'https://wamanga.ru/manhwa/edinstvennaya-vnuchka-silneyshego-gercoga');
  });

  it('marks 18+ adult content properly', () => {
    const raw: WamangaManga = {
      id: 'e0968e0c-f9c4-4e7b-9483-dad2c0dd6da1',
      slug: 'adzhossi-soblaznyaet-vseh',
      title: 'Аджосси соблазняет всех',
      isAdult: true,
      pegiRating: '18+',
      statusTitle: 'completed',
      type: 'manga',
    };

    const manga = parseWamangaTitle(raw);
    assert.strictEqual(manga.isAdult, true);
    assert.strictEqual(manga.ageRating, '18+');
    assert.strictEqual(manga.status, 'COMPLETED');
    assert.strictEqual(manga.type, 'Манга');
  });

  it('parses and orders chapters newest first', () => {
    const chaptersRaw: WamangaChapterItem[] = [
      {
        id: 'ch-1',
        position: 1,
        title: 'Начало',
        createdAt: '2026-08-01T10:00:00.000Z',
        processedFilesCount: 20,
      },
      {
        id: 'ch-3',
        position: 3,
        title: '',
        createdAt: '2026-08-03T10:00:00.000Z',
        processedFilesCount: 25,
      },
      {
        id: 'ch-2',
        position: 2,
        title: 'Продолжение',
        createdAt: '2026-08-02T10:00:00.000Z',
        processedFilesCount: 22,
      },
    ];

    const list = parseWamangaChapters('wamanga~test-id', chaptersRaw);

    assert.strictEqual(list.length, 3);
    assert.strictEqual(list[0].id, 'ch-3');
    assert.strictEqual(list[0].number, 3);
    assert.strictEqual(list[0].title, 'Глава 3');
    assert.strictEqual(list[0].releaseDate, '2026-08-03');
    assert.strictEqual(list[0].pagesCount, 25);

    assert.strictEqual(list[1].id, 'ch-2');
    assert.strictEqual(list[1].number, 2);
    assert.strictEqual(list[1].title, 'Глава 2: Продолжение');

    assert.strictEqual(list[2].id, 'ch-1');
    assert.strictEqual(list[2].number, 1);
  });

  it('parses and sorts chapter pages by position', () => {
    const details: WamangaChapterDetails = {
      id: 'ch-1',
      position: 1,
      files: [
        {
          id: 'f-2',
          diskFile: '/app/uploads/part-1.webp',
          position: '1.001000000',
        },
        {
          id: 'f-1',
          diskFile: '/app/uploads/part-0.webp',
          position: '1.000000000',
        },
        {
          id: 'f-3',
          diskFile: '/app/uploads/part-2.webp',
          position: '2.000000000',
        },
      ],
    };

    const pages = parseWamangaPages(details);

    assert.strictEqual(pages.length, 3);
    assert.strictEqual(pages[0].index, 1);
    assert.ok(decodeURIComponent(pages[0].imageUrl).includes('part-0.webp'));
    assert.strictEqual(pages[1].index, 2);
    assert.ok(decodeURIComponent(pages[1].imageUrl).includes('part-1.webp'));
    assert.strictEqual(pages[2].index, 3);
    assert.ok(decodeURIComponent(pages[2].imageUrl).includes('part-2.webp'));
  });

  it('throws 404 SourceError when chapter has no files', () => {
    assert.throws(
      () => parseWamangaPages({ id: 'ch-empty', position: 1, files: [] }),
      (err: unknown) => err instanceof SourceError && err.status === 404,
    );
  });

  it('integrates with registry and image proxy allow-list', () => {
    const parsed = parseMangaId('wamanga~5cba84f3-905d-4fec-ab16-9db5873da234');
    assert.strictEqual(parsed.source.meta.id, 'wamanga');
    assert.strictEqual(parsed.slug, '5cba84f3-905d-4fec-ab16-9db5873da234');

    assert.ok(isAllowedImageHost('wamanga', 'wamanga.ru'));
    assert.ok(isAllowedImageHost('wamanga', 'cdn.wamanga.ru'));
    assert.strictEqual(isAllowedImageHost('wamanga', 'malicious.com'), null);
    assert.strictEqual(wamangaSource.meta.baseUrl, 'https://wamanga.ru');
  });
});
