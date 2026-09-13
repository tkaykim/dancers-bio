"use server";
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guard';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isVanityNickname } from '@/lib/utils/vanity-nickname';

export async function savePortfolioNickname(dancerId: string, input: string) {
  const user = await requireUser();
  const nickname = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!z.uuid().safeParse(dancerId).success || !isVanityNickname(nickname)) return { ok: false as const, error: 'invalid' as const };
  const db = await createClient();
  const own = await db.from('dancers').select('id,slug').eq('id', dancerId).eq('profile_id', user.id).single();
  if (own.error || !own.data) return { ok: false as const, error: 'failed' as const };
  // Check all profiles, including those hidden by RLS; return only availability.
  const taken = await createAdminClient().from('dancers').select('id').eq('slug', nickname).neq('id', dancerId).limit(1);
  if (taken.error) return { ok: false as const, error: 'failed' as const };
  if (taken.data.length) return { ok: false as const, error: 'taken' as const };
  const saved = await db.from('dancers').update({ slug: nickname }).eq('id', dancerId).eq('profile_id', user.id).select('slug').single();
  if (saved.error) return { ok: false as const, error: saved.error.code === '23505' ? 'taken' as const : 'failed' as const };
  revalidatePath(`/me/portfolio/${dancerId}`);
  revalidatePath(`/d/${nickname}`);
  if (own.data.slug) revalidatePath(`/d/${own.data.slug}`);
  return { ok: true as const, slug: saved.data.slug as string };
}
