-- Workshops 시드 카탈로그 2차 확장 +70명 (D2 완결 — 2026-08-26, 1차 30명과 합쳐 총 100명).
-- ⚠ 1차와 동일 원칙: 전원 WebSearch 검증 통과 핸들만 (이번 배치 검색 ~40건, 팬계정·중복계정 다수 걸러냄).
--    판별 불가 3명(Kenneth San Jose·Slim Boogie·Princess Lockerooo)은 제외하고 대체 후보로 채움.
-- ⚠ status='suggested' + 수요 0 → 공개 화면 미노출, 검색 전용 (listWorkshopWishes 실수요≥1 필터).
-- headline 은 검색에서 확인된 사실 또는 널리 알려진 대표 이력만, 불확실하면 null.

insert into public.workshop_artists (name, instagram_handle, genres, country, headline, status)
values
  -- 미국 LA 코레오 신
  ('Jake Kodish',        'jakekodish',          array['Choreography'],               '미국 LA',   null, 'suggested'),
  ('Janelle Ginestra',   'janelleginestra',     array['Hip-hop','Heels'],            '미국 LA',   null, 'suggested'),
  ('Nick DeMoura',       'nickdemoura',         array['Hip-hop','Commercial'],       '미국 LA',   'Justin Bieber 투어 크리에이티브 디렉터 출신', 'suggested'),
  ('Jade Chynoweth',     'jadebug98',           array['Hip-hop','Contemporary'],     '미국 LA',   null, 'suggested'),
  ('WilldaBeast Adams',  'willdabeast__',       array['Hip-hop'],                    '미국 LA',   'immaBEAST 창립자', 'suggested'),
  ('Tessandra Chavez',   'tessandrachavez',     array['Contemporary'],               '미국 LA',   '에미상 2회 수상 안무가', 'suggested'),
  ('Josh Killacky',      'joshkillacky',        array['Hip-hop'],                    '미국 LA',   'Ellen·World of Dance 출연 안무가', 'suggested'),
  ('CJ Salvador',        '_cjsalvador',         array['Urban'],                      '미국 LA',   null, 'suggested'),
  ('Marissa Heart',      'marissaheart',        array['Heels'],                      '미국 LA',   'Heartbreak Heels 운영', 'suggested'),
  ('Brinn Nicole',       'lovebrinnnicole',     array['Heels'],                      '미국 LA',   'Pumpfidence 창시자', 'suggested'),
  ('Tony Tzar',          'tonytzar',            array['Choreography'],               '미국 LA',   null, 'suggested'),
  ('Charlize Glass',     'charlizeglass',       array['Hip-hop','Contemporary'],     '미국 LA',   null, 'suggested'),
  ('Kaelynn Harris',     'kaelynnharris',       array['Hip-hop','Choreography'],     '미국 LA',   null, 'suggested'),
  ('Ellen Kim',          'ellenkimchee',        array['Urban','Heels'],              '미국 LA',   null, 'suggested'),
  ('Dexter Carr',        'dextercarr',          array['Hip-hop','Commercial'],       '미국 LA',   null, 'suggested'),
  ('Lyle Beniga',        'lylebeniga',          array['Urban'],                      '미국 LA',   null, 'suggested'),
  -- 미국 (그 외)
  ('Antoine Troupe',     'antoinetroupe',       array['Hip-hop'],                    '미국',      null, 'suggested'),
  ('Jawn Ha',            'jawnha',              array['Urban'],                      '미국',      'Kinjaz 멤버', 'suggested'),
  ('Anthony Lee',        '_anthonylee_',        array['Urban'],                      '미국',      'Kinjaz 멤버', 'suggested'),
  ('Carlo Darang',       'carlodarang',         array['Urban'],                      '미국',      'Kinjaz 멤버', 'suggested'),
  ('Bam Martin',         'bam_martin',          array['Urban'],                      '미국',      'Kinjaz 멤버', 'suggested'),
  ('Franklin Yu',        'franklinyu82',        array['Urban'],                      '미국',      null, 'suggested'),
  ('Dana Alexa',         'danaalexa_',          array['Choreography'],               '미국',      null, 'suggested'),
  ('Nicole Laeno',       'nicolelaeno',         array['Choreography'],               '미국',      null, 'suggested'),
  ('Larsen Thompson',    'larsenthompson',      array['Contemporary'],               '미국',      null, 'suggested'),
  ('Gabe De Guzman',     'gabedofficial',       array['Hip-hop'],                    '미국',      null, 'suggested'),
  ('Fik-Shun',           'dance10fikshun',      array['Freestyle'],                  '미국',      'SYTYCD 시즌10 우승', 'suggested'),
  ('Samantha Long',      'samantha_long_',      array['Choreography'],               '미국',      '뮤직비디오 감독·셀러브리티 안무가', 'suggested'),
  ('Chachi Gonzales',    'chachigonzales',      array['Hip-hop'],                    '미국',      'ABDC 우승 크루 I.aM.mE 출신', 'suggested'),
  ('Kida the Great',     'kidathegreat',        array['Freestyle','Hip-hop'],        '미국',      'SYTYCD 시즌13 우승', 'suggested'),
  ('Julian DeGuzman',    'juliandeguz13',       array['Hip-hop'],                    '미국',      'immaBEAST 출신, The New Wave 컨벤션 창립', 'suggested'),
  ('Danielle Polanco',   'dannip18',            array['Heels','Vogue'],              '미국 NY',   null, 'suggested'),
  ('Luam',               'luamky',              array['Hip-hop'],                    '미국 NY',   null, 'suggested'),
  ('Shaun Evaristo',     'shaunevaristo',       array['Urban'],                      '미국',      'Movement Lifestyle 창립', 'suggested'),
  ('Aidan Prince',       'aidanprinceofficial', array['Hip-hop'],                    '미국',      null, 'suggested'),
  ('Rumer Noel',         'rumernoel',           array['Hip-hop','Commercial'],       '미국',      null, 'suggested'),
  ('Greg Chapkis',       'gregchapkis',         array['Hip-hop'],                    '미국',      'Chapkis Dance 창립', 'suggested'),
  ('Ysabelle Capitule',  'ysabellecaps',        array['Hip-hop','Heels'],            '미국',      null, 'suggested'),
  ('Poppin John',        'poppinjohnsbk',       array['Popping'],                    '미국',      null, 'suggested'),
  ('Dytto',              'iam_dytto',           array['Popping','Animation'],        '미국',      null, 'suggested'),
  ('Marquese Scott',     'nonstop12',           array['Animation'],                  '미국',      null, 'suggested'),
  ('Tight Eyez',         'officialtighteyex',   array['Krump'],                      '미국',      'Krump 창시자', 'suggested'),
  ('Leiomy Maldonado',   'wond3rwoman1',        array['Vogue'],                      '미국 NY',   '보깅의 아이콘', 'suggested'),
  -- 캐나다
  ('Blake McGrath',      'blakemcgrath',        array['Jazz','Contemporary'],        '캐나다',    null, 'suggested'),
  ('Enola Bedard',       'enola.bedard',        array['Choreography'],               '캐나다',    null, 'suggested'),
  ('Taylor Hatala',      'tayd_dance',          array['Hip-hop'],                    '캐나다',    null, 'suggested'),
  ('Alexander Chung',    'alexander.chung',     array['Urban'],                      '캐나다',    null, 'suggested'),
  ('Scott Forsyth',      'scott4syth',          array['Choreography'],               '캐나다',    'BTS·NCT 127 등과 작업, Studio North 공동 대표', 'suggested'),
  ('Phil Wizard',        'philkwizard',         array['Breaking'],                   '캐나다',    '파리 2024 브레이킹 초대 올림픽 금메달', 'suggested'),
  -- 유럽
  ('Yanis Marshall',     'yanismarshall',       array['Heels'],                      '프랑스',    null, 'suggested'),
  ('Sadeck Waff',        'sadeckwaff',          array['Choreography'],               '프랑스',    '파리 패럴림픽 세리머니 안무 — 기하학적 군무', 'suggested'),
  ('Marion Motin',       'marionmotin',         array['Contemporary','Hip-hop'],     '프랑스',    null, 'suggested'),
  ('Salif Gueye',        'salif_crookboyz',     array['Freestyle'],                  '프랑스',    '마이클 잭슨 스타일 스트리트 댄서', 'suggested'),
  ('Salah',              'spidersalah1979',     array['Popping','Hip-hop'],          '프랑스',    '프랑스·아랍 갓 탤런트 우승 엔터테이너', 'suggested'),
  ('Bouboo',             'bouboothecrow',       array['Hip-hop'],                    '프랑스',    'Criminalz Crew', 'suggested'),
  ('Duc Anh Tran',       'dukiofficial_',       array['Hip-hop'],                    '독일',      null, 'suggested'),
  ('Anze Skrube',        'anzeskrube',          array['Choreography'],               '슬로베니아', 'ATEEZ 안무가', 'suggested'),
  ('Nika Kljun',         'nikakljun',           array['Choreography','Heels'],       '미국 LA',   null, 'suggested'),
  ('Sherrie Silver',     'sherriesilver',       array['Afro','Choreography'],        '영국',      '''This Is America'' 뮤직비디오 안무', 'suggested'),
  -- 오세아니아
  ('Kirsten Dodgen',     'kirstendodgen',       array['Choreography','Heels'],       '뉴질랜드',  'ReQuest — 스트릿 우먼 파이터2 잼 리퍼블릭', 'suggested'),
  -- 일본
  ('Rikimaru',           'rikimaruchikada',     array['Urban'],                      '일본',      null, 'suggested'),
  ('Gucchon',            'gucchon0516',         array['Popping'],                    '일본',      'Co-thkoo — 세계적인 파핑 듀오', 'suggested'),
  ('KAITA',              'kaita_the_hataboy',   array['Hip-hop'],                    '일본',      'RIEHATA TOKYO — BE:FIRST·ENHYPEN 등 안무', 'suggested'),
  ('Miyu',               'miyudance_',          array['Hip-hop'],                    '일본',      '월드 챔피언 무브먼트 아티스트', 'suggested'),
  ('B-Girl Ami',         'gfc_ami',             array['Breaking'],                   '일본',      '파리 2024 브레이킹 초대 올림픽 금메달', 'suggested'),
  ('Shigekix',           'bboyshigekix',        array['Breaking'],                   '일본',      null, 'suggested'),
  ('Issei',              'fncbboyissei',        array['Breaking'],                   '일본',      'Red Bull BC One 월드 챔피언', 'suggested'),
  -- 필리핀
  ('AC Bonifacio',       'acbonifacio',         array['Choreography'],               '필리핀',    null, 'suggested'),
  ('Niana Guerrero',     'nianaguerrero',       array['Hip-hop'],                    '필리핀',    null, 'suggested'),
  ('Ranz Kyle',          'ranzkyle',            array['Hip-hop'],                    '필리핀',    null, 'suggested')
on conflict ((lower(instagram_handle))) do nothing;
