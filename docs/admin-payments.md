# deetz 통합 결제 장부

`/admin/payments`는 deetz 내부 결제와 별도 grigoent 결제 원장을 관리자 전용으로 합쳐 보여주는 조회 화면이다.

## 배포 설정

deetz 서버 환경 변수에 아래 두 값을 등록해야 grigoent의 `training_orders`, `training_order_payments`, `training_products`, `training_price_plans`를 읽을 수 있다.

```text
GRIGOENT_SUPABASE_URL=https://<grigoent-project>.supabase.co
GRIGOENT_SUPABASE_SERVICE_ROLE_KEY=<grigoent-service-role-key>
```

서비스 롤 키는 서버 환경 변수로만 등록하고 브라우저 환경 변수나 클라이언트 코드에 넣지 않는다.

설정이 없으면 화면은 deetz 내부 결제만 표시하고 연결 누락을 경고한다.

## 데이터 원장 규칙

- grigoent 트레이닝·오디션·월간 트레이닝·Village 주문은 grigoent 원장을 표시한다.
- 비자 케이스의 결제 상태는 deetz 미러를 표시한다.
- grigoent 주문의 `visa_application_id`, 외부 주문번호, deetz 미러 주문번호가 일치하면 하나의 행으로 합친다.
- 워크샵 예약과 워크샵 행사는 deetz 테이블을 원장으로 사용한다.
- `payment-test`는 숨기지 않고 `TEST`와 확인 필요 상태로 표시해 운영 매출에 포함하지 않도록 한다.

이 화면은 현재 조회 전용이다.

환불은 기존처럼 grigoent 관리자 또는 PG 콘솔의 실제 환불 절차를 사용하고, 이후 원장 상태를 다시 확인한다.
