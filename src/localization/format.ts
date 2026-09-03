import { LOCALES, type AppLanguage } from './registry';

/**
 * Locale routing for dates, ordinals, numbers, and percentages.
 *
 * Dates resolve through the registry's Intl locale — screen-local ternaries
 * are gone. Numbers, chips, and percentages are routed through here too, with
 * an explicit, documented poker-notation decision: chips, big-blind amounts,
 * and percentages render identically in every locale (`2,000`, `2.5`, `40%`)
 * so a wager is never quoted two ways and interpolated poker facts stay
 * byte-identical to the verified analysis. That invariance lives here, not in
 * callers. (See docs/localization-inventory.json language-neutral flags and
 * both style guides §6–§7.)
 */

/** The Intl locale for one app language (dates and any future locale-aware formatting). */
export function localeIntl(language: AppLanguage): string {
  return LOCALES[language].intlLocale;
}

const enOrdinalRules = (place: number): string => {
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`;
  switch (place % 10) {
    case 1: return `${place}st`;
    case 2: return `${place}nd`;
    case 3: return `${place}rd`;
    default: return `${place}th`;
  }
};

/** English place ordinal ("1st", "2nd", "13th"), exported for existing callers. */
export const englishOrdinal = enOrdinalRules;

/**
 * Place ordinals for compact result surfaces: "1st", "第 1 名", "1.º", "1º".
 * Spanish uses the RAE ordinal indicator with the period; Brazilian
 * Portuguese the bare indicator. Both are on the compact-risk device-review
 * list (style guides §9).
 */
export function localizedOrdinalPlace(place: number, language: AppLanguage): string {
  if (language === 'zh-Hans' || language === 'zh-Hant') return `第 ${place} 名`;
  if (language === 'es-419') return `${place}.º`;
  if (language === 'pt-BR') return `${place}º`;
  return enOrdinalRules(place);
}

/**
 * Numbers render with the poker-notation-invariant grouping: exact chips and
 * counts read "2,000" in every locale. Single implementation; callers never
 * pick a formatting locale.
 */
export function formatLocaleNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}
