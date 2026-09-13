"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/provider';
import messages from '@/lib/i18n/messages/portfolio-nickname';
import { nicknameSuggestion } from '@/lib/utils/vanity-nickname';
import { savePortfolioNickname } from '@/app/actions/portfolio-nickname';

export function PortfolioNickname({ dancerId, slug, stageName, onSaved }: {
  dancerId: string; slug: string | null; stageName: string; onSaved: (value: string) => void;
}) {
  const t = useT(messages), router = useRouter();
  const suggestion = nicknameSuggestion(stageName);
  const [value, setValue] = useState(slug || suggestion);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<'' | 'saved' | 'invalid' | 'taken' | 'failed'>('');
  return <form className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border p-5" onSubmit={async event => {
    event.preventDefault(); if (pending) return; setPending(true); setStatus('');
    try {
      const result = await savePortfolioNickname(dancerId, value);
      if (!result.ok) { setStatus(result.error); return; }
      setValue(result.slug); onSaved(result.slug); setStatus('saved'); router.refresh();
    } catch { setStatus('failed'); } finally { setPending(false); }
  }}>
    <label htmlFor="portfolio-nickname" className="font-semibold">{t('title')}</label>
    <p className="whitespace-pre-line text-sm text-ink-2">{t('hint')}</p>
    <div className="flex min-w-0 items-center rounded-xl border border-input px-3">
      <span className="shrink-0 text-sm text-ink-2">dancers.bio/</span>
      <input id="portfolio-nickname" value={value} onChange={e=>{setValue(e.target.value.toLowerCase());setStatus('');}} required minLength={2} maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="nickname" className="min-h-12 min-w-0 flex-1 bg-transparent px-1 text-base outline-none" />
    </div>
    {suggestion && suggestion !== value && <button type="button" disabled={pending} onClick={()=>{setValue(suggestion);setStatus('');}} className="min-h-11 self-start text-sm underline">{t('useName')} · {suggestion}</button>}
    {slug && value.trim().toLowerCase() !== slug && <p className="text-xs text-ink-2">{t('changeHint')}</p>}
    <button disabled={pending || !value.trim()} className="min-h-11 rounded-xl bg-foreground px-4 text-sm text-background disabled:opacity-50">{t(pending ? 'saving' : 'save')}</button>
    <p role="status" className="whitespace-pre-line text-sm">{status ? t(status) : ''}</p>
  </form>;
}
