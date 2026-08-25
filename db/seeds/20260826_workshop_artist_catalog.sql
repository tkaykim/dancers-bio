-- Workshops 시드 카탈로그 1차 (D2 — 2026-08-26).
-- 목적: 검색 우선 제출 플로우에서 "검색하면 나온다" 경험 + 콜드스타트 해소.
-- ⚠ 전원 웹 검증된 핸들만 (2026-08-26 WebSearch 24건 — 초기 후보 중 미검증 이름은 전부 제외).
-- ⚠ status='suggested' + 수요 0 → 위시 섹션·공개 카드 어디에도 안 뜨고 검색에서만 잡힌다.
--    (listWorkshopWishes 가 "실수요 1건 이상" 필터를 걸기 때문 — queries.ts)
-- 사진은 권리 문제로 넣지 않는다. 후보 승격 시 공식 출처로만.

insert into public.workshop_artists (name, instagram_handle, genres, country, headline, status)
values
  -- 미국 (LA/NY 코레오 신)
  ('Kyle Hanagami',       'kylehanagami',     array['Choreography'],                '미국 LA',   'BLACKPINK·Justin Bieber 등과 작업한 LA 안무가', 'suggested'),
  ('Matt Steffanina',     'mattsteffanina',   array['Hip-hop','Choreography'],      '미국 LA',   '유튜브로 세계적 인지도를 얻은 LA 안무가', 'suggested'),
  ('Jojo Gomez',          'jojogomezxo',      array['Heels','Choreography'],        '미국 LA',   'LA 기반 안무가·크리에이티브 디렉터', 'suggested'),
  ('Tricia Miranda',      '1triciamiranda',   array['Hip-hop'],                     '미국 LA',   '바이럴 클래스 영상으로 유명한 LA 안무가', 'suggested'),
  ('Galen Hooks',         'galenhooks',       array['Heels','Contemporary'],        '미국 LA',   'The Galen Hooks Method 운영', 'suggested'),
  ('Kaycee Rice',         'kayceerice',       array['Hip-hop','Contemporary'],      '미국 LA',   null, 'suggested'),
  ('Sean Lew',            'seanlew',          array['Contemporary','Hip-hop'],      '미국 LA',   'World of Dance 로 알려진 댄서·안무가', 'suggested'),
  ('Bailey Sok',          'baileysok',        array['Choreography'],                '미국',      null, 'suggested'),
  ('Keone & Mari Madrid', 'keoneandmari',     array['Choreography'],                '미국',      'BTS·Justin Bieber·디즈니 Us Again 의 부부 안무 듀오', 'suggested'),
  ('Sienna Lalau',        'sienna.lalau',     array['Hip-hop','Choreography'],      '미국',      'BTS ''ON'' 안무 참여', 'suggested'),
  ('Sean Bankhead',       'itsbankhead',      array['Commercial','Hip-hop'],        '미국',      'Normani·Lizzo 등과 작업한 안무가', 'suggested'),
  ('JaQuel Knight',       'jaquelknight',     array['Commercial'],                  '미국',      'Beyoncé ''Single Ladies'' 안무', 'suggested'),
  ('Zoi Tatopoulos',      'ztato',            array['Experimental','Commercial'],   '미국 LA',   'FKA twigs 등과 작업한 크리에이티브 디렉터', 'suggested'),
  ('Phil Wright',         'phil_wright_',     array['Hip-hop'],                     '미국 LA',   'The Parent Jam 창시자', 'suggested'),
  ('Delaney Glazer',      'deeglazer',        array['Choreography'],                '미국 LA',   'Playground LA 강사', 'suggested'),
  ('Brian Friedman',      'brianfriedman',    array['Jazz funk','Heels'],           '미국 LA',   'Britney Spears·X Factor 크리에이티브 디렉터 출신', 'suggested'),
  ('Vinh Nguyen',         'v1nh',             array['Urban','Choreography'],        '미국',      'Kinjaz — 디렉터·안무가', 'suggested'),
  ('Mike Song',           'mikeosong',        array['Urban'],                       '미국',      'Kinjaz 공동 창립 멤버', 'suggested'),
  ('Brian Puspos',        'brianpuspos',      array['Urban','Choreography'],        '미국',      '정국 ''Seven'' 퍼포먼스 협업 안무가', 'suggested'),
  ('Melvin Timtim',       'melvintim2',       array['Freestyle','Choreography'],    '미국',      'S-Rank 창립, 에미상 후보 안무가', 'suggested'),
  ('Aliya Janell',        'thealiyajanell',   array['Heels'],                       '미국 LA',   'Queens N'' Lettos 클래스 운영', 'suggested'),
  -- 유럽
  ('Les Twins',           'officiallestwins', array['Hip-hop','Freestyle'],         '프랑스',    'World of Dance 우승 프리스타일 듀오', 'suggested'),
  ('Tobias Ellehammer',   'tobiasellehammer', array['Commercial','Choreography'],   '덴마크',    null, 'suggested'),
  -- 오세아니아
  ('Parris Goebel',       'parrisgoebel',     array['Choreography','Heels'],        '뉴질랜드',  'Rihanna 슈퍼볼·Justin Bieber ''Sorry'' 안무', 'suggested'),
  ('Kiel Tutin',          'kieltutin',        array['Choreography','Heels'],        null,        'BLACKPINK 다수 곡 안무 참여', 'suggested'),
  -- 일본
  ('RIEHATA',             'riehata',          array['Hip-hop','Choreography'],      '일본',      'K-pop 다수 안무의 안무가·아티스트', 'suggested'),
  ('Koharu Sugawara',     'kokokoharu',       array['Contemporary','Choreography'], '일본',      '국제 무대에서 활동하는 일본 안무가', 'suggested'),
  ('Kyoka',               'kyoka_rb.official',array['Hip-hop'],                     '일본',      'RUSHBALL — Red Bull 스폰서드 댄서', 'suggested'),
  ('Ibuki Imata',         'ibuki.japan',      array['Hip-hop','Waacking'],          '일본',      'Juste Debout 우승 경력의 댄서', 'suggested'),
  ('Akanen',              'akanenmiyoshi',    array['Jazz','Heels','Hip-hop'],      '일본',      'XG·aespa 등 K-pop 안무 참여', 'suggested')
on conflict ((lower(instagram_handle))) do nothing;
