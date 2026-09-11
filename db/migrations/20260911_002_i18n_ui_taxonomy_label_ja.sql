-- deetz UI 다국어 (docs/design-i18n-ui.md §4 M3)
-- 운영 적용: 2026-09-11 (Supabase migration i18n_ui_taxonomy_label_ja_20260911)
-- 롤백: alter table public.genres drop column label_ja; alter table public.regions drop column label_ja;

alter table public.genres add column if not exists label_ja text;
alter table public.regions add column if not exists label_ja text;

update public.genres g set label_ja = v.label_ja
from (values
  ('heels','ヒールダンス'),('heels-choreo','ヒールコレオ'),('hip-hop','ヒップホップ'),('kpop','K-POP'),
  ('girls-hip-hop','ガールズヒップホップ'),('locking','ロッキング'),('popping','ポッピング'),('waacking','ワッキング'),
  ('voguing','ヴォーギング'),('house','ハウス'),('krump','クランプ'),('bboying','ブレイキン'),('urban','アーバン'),
  ('jazz','ジャズ'),('contemporary','コンテンポラリー'),('ballet','バレエ'),('choreography','コレオグラフィー'),('other','その他')
) as v(slug, label_ja)
where g.slug = v.slug and g.label_ja is null;

update public.regions r set label_ja = v.label_ja
from (values
  ('seoul','ソウル'),('busan','釜山'),('daegu','大邱'),('incheon','仁川'),('gwangju','光州'),('daejeon','大田'),
  ('ulsan','蔚山'),('sejong','世宗'),('gyeonggi','京畿道'),('gangwon','江原道'),('chungbuk','忠清北道'),('chungnam','忠清南道'),
  ('jeonbuk','全羅北道'),('jeonnam','全羅南道'),('gyeongbuk','慶尚北道'),('gyeongnam','慶尚南道'),('jeju','済州')
) as v(slug, label_ja)
where r.slug = v.slug and r.label_ja is null;
