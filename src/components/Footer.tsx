'use client';

import { usePathname } from 'next/navigation';

export default function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith('/read/')) return null;
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <div style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Tsundoku Web</div>
          <div>
            Репозиторий проекта на GitHub:{' '}
            <a href="https://github.com/Amir1502/Tsundoku" target="_blank" rel="noopener noreferrer">
              Amir1502/Tsundoku
            </a>
            . Контент принадлежит правообладателям и сайтам-источникам.
          </div>
        </div>
        <div>Источники: MangaLib · ReManga · Com-X · MangaMir · WaManga · MangaDex · Книги 11 класс · Manga18fx (18+)</div>
      </div>
    </footer>
  );
}
