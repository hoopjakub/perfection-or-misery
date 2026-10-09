// Structured data for the front page (09 §7): the game, as search engines read
// it. No rating: there's no rating to back one (vibecode TRU-15).
import { T, GAME_URL, type Lang } from '../i18n'
export const GAME_JSON_LD = (lang: Lang) => ({
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Perfection or Misery',
  description: T[lang].description,
  genre: ['Sports', 'Roguelike'],
  gamePlatform: ['Web browser', 'Android'],
  applicationCategory: 'Game',
  inLanguage: ['en', 'sk'],
  url: GAME_URL,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
})
