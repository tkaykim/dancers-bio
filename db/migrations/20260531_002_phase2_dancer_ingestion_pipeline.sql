-- 20260531_002 phase2_dancer_ingestion_pipeline
-- 공급 인제스트(IG 크롤 3단계 큐): 발견풀 → 스크랩큐 → 검수게이트 + 아웃리치.
-- 전부 admin-only RLS. project_ingestions 패턴 미러. (적용은 MCP apply_migration로 완료)
-- 실제 적용 SQL은 동명 마이그레이션 참조. 이 파일은 레포 기록용.

-- 테이블: ig_discovery, dancer_scrape_queue, dancer_ingestions, dancer_outreach
-- 함수: dancer_ingestion_stats() jsonb
-- 자세한 정의는 supabase 마이그레이션 phase2_dancer_ingestion_pipeline 참조.
