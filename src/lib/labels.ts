import { MangaStatus, ReadingStatus } from './types';

export const STATUS_LABELS: Record<MangaStatus, string> = {
  ONGOING: 'Онгоинг',
  COMPLETED: 'Завершён',
  HIATUS: 'Заморожен',
  CANCELLED: 'Выпуск прекращён',
  UNKNOWN: 'Статус неизвестен',
};

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  reading: 'Читаю',
  planned: 'В планах',
  completed: 'Прочитано',
  dropped: 'Брошено',
};

export const SOURCE_LABELS: Record<string, string> = {
  mangalib: 'MangaLib',
  remanga: 'ReManga',
  mangamir: 'MangaMir',
  wamanga: 'WaManga',
  comx: 'Com-X',
  mangadex: 'MangaDex',
  manga18fx: 'Manga18fx',
  demo: 'Демо',
};

export function formatDate(iso?: string | number): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 7) return `${days} дн. назад`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}
