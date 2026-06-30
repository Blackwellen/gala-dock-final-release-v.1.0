// Gala Dock — workspace locale resolver (INTL-6). Maps a workspace's country/locale/currency
// to a resolved formatting + compliance context that any module can use (finance, tax, legal,
// calendar, forms). Prefers explicit workspace locale/currency columns, falling back to the
// CountryPack defaults.

import { countryPack, type CountryPack } from "./countries";

export interface WorkspaceLocale {
  country: string;
  locale: string;
  currency: string;
  rtl: boolean;
  taxSystem: string;
  privacy: string[];
  pack: CountryPack;
}

export function resolveWorkspaceLocale(opts: {
  country?: string | null;
  locale?: string | null;
  currency?: string | null;
}): WorkspaceLocale {
  const pack = countryPack(opts.country);
  return {
    country: pack.code,
    locale: opts.locale || pack.locale,
    currency: opts.currency || pack.currency,
    rtl: pack.rtl,
    taxSystem: pack.taxSystem,
    privacy: pack.privacy,
    pack,
  };
}
