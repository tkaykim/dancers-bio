export function isSuperAdmin(profile: {
  is_admin: boolean;
  is_super_admin?: boolean | null;
}): boolean {
  return profile.is_admin && profile.is_super_admin === true;
}
