// P8.5-28 · Keys are checked by TypeScript: t('settings.titel') is an error.
import 'i18next'
import type { en } from './en'

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en }
    returnNull: false
  }
}
