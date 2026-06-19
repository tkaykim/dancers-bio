# NDOL 채널 통합 기록

## 목적

2026년 6월 18일 남자아이돌 댄서 모집 프로젝트를 `ndol26` 부모 프로젝트 기준으로 통합한다.

기존에 별도 프로젝트로 배포된 `ndol02`, `ndolsm`, `ndolbd`, `ndol37` 등은 삭제하지 않고 `recruitment_channels.legacy_project_id`로 부모 프로젝트에 연결한다.

기존 지원서의 `project_id`는 보존하고, `applications.recruitment_channel_id`만 채워 부모 프로젝트 화면에서 채널별로 합쳐 볼 수 있게 한다.

지원 마감일은 모두 KST 기준 `2026-06-18 23:59:00+09:00`으로 맞춘다.

## 부모 프로젝트

- 부모 프로젝트 short code: `ndol26`
- 공개 레거시 링크 처리: `/projects/{legacyShortCode}` 접근 시 `/projects/ndol26?channel={share_code}`로 이동
- 기존 관리자용 레거시 데이터: 삭제하지 않고 보존

## 통합 대상

| short_code | 채널명 | 유형 |
|---|---|---|
| ndol26 | 기본 모집 | general |
| ndol02 | 기본 B | external |
| ndolsm | 상명대 | school |
| ndolbd | BADD | partner |
| ndol37 | 서울문화예술대 | school |
| ndoldc | 댄스동아리 | partner |
| ndolha | 한야 | school |
| ndolhl | 한림예고 | school |
| ndolhy | 한양대 | school |
| ndoljh | 정화예대 | school |
| ndolka | 한예종 | school |
| ndolkm | 국민대 | school |
| ndolsj | 세종대 | school |
| ndolsp | 서울공연예술학교 | school |
| ay25bg | 지인 추가 섭외 | direct |
| zudrz5 | 지인 예비 링크 | direct |

## 작업 전 기준 수량

| short_code | 전체 | 승인 | 대기 | 거절 | 철회 |
|---|---:|---:|---:|---:|---:|
| ay25bg | 1 | 1 | 0 | 0 | 0 |
| ndol02 | 42 | 23 | 0 | 12 | 7 |
| ndol26 | 218 | 76 | 0 | 109 | 33 |
| ndol37 | 7 | 6 | 0 | 0 | 1 |
| ndolbd | 20 | 12 | 0 | 0 | 8 |
| ndoldc | 0 | 0 | 0 | 0 | 0 |
| ndolha | 4 | 0 | 0 | 0 | 4 |
| ndolhl | 0 | 0 | 0 | 0 | 0 |
| ndolhy | 0 | 0 | 0 | 0 | 0 |
| ndoljh | 0 | 0 | 0 | 0 | 0 |
| ndolka | 0 | 0 | 0 | 0 | 0 |
| ndolkm | 0 | 0 | 0 | 0 | 0 |
| ndolsj | 0 | 0 | 0 | 0 | 0 |
| ndolsm | 51 | 31 | 0 | 15 | 5 |
| ndolsp | 0 | 0 | 0 | 0 | 0 |
| zudrz5 | 0 | 0 | 0 | 0 | 0 |

작업 전 통합 지원서 수는 343건이다.

작업 전 통합 승인 수는 149건이다.

## DB 보존 위치

- `archive.ndol_channel_unification_projects_pre_20260619`
- `archive.ndol_channel_unification_applications_pre_20260619`
- `archive.ndol_channel_unification_channels_pre_20260619`
- `archive.ndol_channel_unification_expected_counts_20260619`
- `archive.ndol_channel_unification_post_counts_20260619`

새로 만든 archive 테이블은 anon/authenticated 권한을 revoke하고 RLS를 켰다.

기존 archive 테이블의 RLS 경고는 별도 보안 판단이 필요하므로 이번 전환 작업에서 자동 변경하지 않는다.

## 검증 기준

1. 통합 대상 16개 프로젝트가 모두 `recruitment_channels`에 1개씩 연결되어야 한다.
2. 통합 대상 지원서 343건이 모두 `recruitment_channel_id`를 가져야 한다.
3. 채널별 지원자 수가 작업 전 프로젝트별 지원자 수와 같아야 한다.
4. 부모 프로젝트 `ndol26` 지원자 콘솔에서 통합 대상 지원자가 총 343명으로 보여야 한다.
5. 기존 공개 모집 링크는 부모 프로젝트의 채널 링크로 이동해야 한다.
6. 2026년 6월 18일 23:59 KST 이후 신규 지원은 마감 처리되어야 한다.

## 후속 주의사항

레거시 일정 응답 데이터는 기존 프로젝트에 그대로 남긴다.

새 일정 요청, 현장 운영, 참가자 시딩은 부모 프로젝트 기준으로 진행하되, 연결 채널 지원자까지 대상 계산에 포함한다.
