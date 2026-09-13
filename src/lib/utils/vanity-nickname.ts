import { isValidSlug, slugify } from './slug';

export const RESERVED_VANITY_SEGMENTS = new Set([
  'admin', 'applications', 'me', 'proposals', 'verify-instagram', 'claim',
  'forgot-password', 'login', 'signup', 'd', 'dancers', 'feed', 't', 'u',
  'api', 'h', 'onboarding', 'projects', 'reset-password', 's', 'sr', 'fr',
  'fit', 'sz', 'welcome', 'workshops', 'messages',
]);
export function isVanityNickname(value: string) {
  return isValidSlug(value) && !RESERVED_VANITY_SEGMENTS.has(value);
}
export function nicknameSuggestion(stageName: string) {
  const value = slugify(stageName);
  return isVanityNickname(value) ? value : '';
}
