# deetz 통합 결제 장부

`/admin/payments`는 deetz에서 판매한 상품과 grigoent 결제 원장을 한 화면에서 조회하고 취소·환불 작업을 통제하는 관리자 화면이다.

기본 화면은 주문을 한 줄로 표시하는 리스트이며, 행을 클릭하면 고객 정보, 회차별 결제, PG 승인 통화, 환불 이력, 승인 작업 이력이 오른쪽 상세 패널에 열린다.

검색은 주문번호, 고객명, 이메일, 전화번호, 결제 ID, 익명 접속 식별자, 유입 경로를 대상으로 한다.

원장, 상태, 상품, 확인 필요 여부를 필터링할 수 있으며 한 페이지에 25건, 50건, 100건을 표시한다.

## 원장 기준

- 트레이닝 패키지, 오디션 참석비, 월간 트레이닝, Village 주문은 grigoent의 `training_orders`와 `training_order_payments`를 원장으로 사용한다.

- 비자 케이스의 결제 상태는 deetz 운영용 미러이며 직접 환불하지 않는다.

- 비자 미러와 grigoent 주문의 외부 주문 ID 또는 주문번호가 일치하면 grigoent 원천 주문 한 건으로 합친다.

- 워크샵 예약과 워크샵 행사는 deetz의 결제 테이블을 원장으로 사용한다.

- `payment-test` 주문은 숨기지 않고 내부 테스트 건으로 표시한다.

- Toss 카드·계좌 인증 전에 결제창을 닫은 건은 `abandoned`·`결제창 이탈`로 표시하고 결제 실패나 확인 필요 건수에 포함하지 않는다.

- grigoent 주문에 기록된 익명 접속 식별자, 브라우저 정보, 쿼리스트링이 제거된 유입 경로는 상세 패널에서 확인한다.

## 취소와 환불

결제 전 `pending` 또는 `failed` 건은 취소 요청을 만들 수 있다.

서버는 Toss 또는 PayPal의 현재 상태를 조회한 뒤 미승인 건으로 확인된 경우에만 주문을 취소한다.

이미 PG 승인키가 있거나 PG에서 승인된 건은 취소할 수 없으며 환불 절차를 사용해야 한다.

결제 완료 건은 전체환불과 부분환불을 모두 지원한다.

Toss는 원화 환불 금액을 그대로 전달한다.

PayPal은 원장 금액과 실제 승인 통화를 함께 보관한다.

예를 들어 원장 금액이 100,000원이고 실제 승인이 75.00달러라면 40,000원 부분환불은 30.00달러로 계산한다.

마지막 전액환불은 반올림으로 남은 실제 PG 잔액을 모두 사용한다.

원결제 금액과 승인 응답은 환불 후에도 수정하지 않는다.

각 환불 금액, 승인 통화 금액, PG 환불 거래 ID, 요청·완료 시각은 별도 환불 원장에 누적한다.

## 권한별 실행

기본 관리자는 2인 승인 절차를 사용한다.

첫 번째 관리자는 금액과 사유를 입력해 요청을 등록한다.

요청 등록만으로 PG 호출이나 자금 이동은 발생하지 않는다.

다른 관리자가 승인하면 서버가 PG 상태를 다시 확인하고 동일한 작업 ID로 취소·환불을 실행한다.

요청자는 자신의 요청을 승인할 수 없다.

대표처럼 직접 실행 권한이 명시적으로 부여된 관리자는 요청 저장 직후 같은 작업 ID로 PG 취소·환불을 실행한다.

권한 부여 전에 본인이 만든 승인 대기 작업도 상세 이력의 `즉시 실행`으로 같은 작업 ID를 이어서 처리할 수 있다.

직접 실행 화면은 자금 이동 경고와 브라우저 최종 확인을 한 번 더 표시한다.

직접 실행자는 `payment_operation_executors` 서버 전용 허용 목록으로 판정하며 클라이언트 입력이나 일반 `is_admin` 권한만으로 이 방식을 선택할 수 없다.

직접 실행 작업은 `execution_mode=direct`와 동일 요청자·승인자를 원장에 남기며 일반 작업은 `execution_mode=two_person`과 서로 다른 요청자·승인자를 DB 제약으로 강제한다.

같은 결제에는 승인 대기, 처리 중, PG 완료 대기, 대사 필요 작업을 한 건만 유지한다.

Toss의 `Idempotency-Key`와 PayPal의 `PayPal-Request-Id`에는 통제 원장의 작업 ID를 사용한다.

## PG 완료 대기와 대사

PayPal이 `PENDING`을 반환하거나 네트워크 오류로 결과를 단정할 수 없으면 결제를 완료 또는 실패로 임의 변경하지 않는다.

상세 패널의 `PG 상태 다시 확인`으로 기존 환불 거래를 조회한다.

`대사 필요` 작업은 동일 요청을 다시 승인하거나 새 환불을 실행하면 안 된다.

PG 콘솔의 거래 ID와 내부 환불 원장을 먼저 대조해야 한다.

PG 환불은 완료됐지만 원결제 상태 반영이 실패한 경우에도 환불 원장을 `대사 필요`로 되돌린다.

이 작업을 다시 확인하면 PG에 새 환불을 만들지 않고 완료된 거래를 기준으로 내부 상태 반영을 재시도한다.

토스 거래 ID가 없고 같은 금액과 사유의 취소가 여러 건이면 임의의 거래를 선택하지 않고 수동 대사 대상으로 남긴다.

5분 넘게 `처리 중`에 머문 작업은 상세 패널에서 상태를 다시 확인할 수 있다.

## 배포 설정

deetz 서버에는 다음 환경 변수가 필요하다.

```text
GRIGOENT_SUPABASE_URL=https://<grigoent-project>.supabase.co
GRIGOENT_SUPABASE_SERVICE_ROLE_KEY=<grigoent-service-role-key>
PAYMENT_COMMAND_SECRET=<32자 이상의 무작위 공유 시크릿>
GRIGOENT_PAYMENT_COMMAND_URL=https://www.grigoent.co.kr/api/internal/payment-operations
```

`GRIGOENT_PAYMENT_COMMAND_URL`은 기본 주소를 사용할 때 생략할 수 있다.

`PAYMENT_COMMAND_SECRET`은 deetz와 grigoent에 같은 값을 등록한다.

서비스 롤 키와 공유 시크릿은 서버 환경 변수로만 관리한다.

Toss와 PayPal의 기존 운영 키도 두 앱의 서버 환경에 올바르게 설정되어 있어야 한다.

## DB 적용 순서

1. grigoent에 `db/migrations/20260829_001_training_payment_refunds.sql`을 적용한다.

2. deetz에 `db/migrations/20260829_001_payment_refund_control_plane.sql`을 적용한다.

3. deetz에 `db/migrations/20260830_001_direct_payment_operation_execution.sql`을 적용하고 승인된 대표 계정만 `payment_operation_executors`에 활성화한다.

4. 두 앱에 `PAYMENT_COMMAND_SECRET`을 같은 값으로 등록한다.

5. grigoent를 먼저 배포하고 deetz를 배포한다.

6. 운영 키로 실제 환불하기 전에 별도 테스트 결제로 전체환불과 부분환불을 확인한다.

새 원장은 RLS를 켜고 `anon`, `authenticated` 권한을 제거했다.

작업·환불 원장의 서비스 롤에는 조회, 추가, 갱신 권한만 부여하며 삭제와 비우기 권한은 주지 않는다.

직접 실행 허용 목록은 서비스 롤에도 조회만 허용하고 변경은 관리형 SQL 경로로 제한한다.

## 검증 명령

```text
npm run typecheck
npm run test:payment-refunds
npm run build
```

grigoent에서는 다음 명령을 함께 실행한다.

```text
npm run typecheck:payment-refunds
npm run test:payment-refunds
npm run build
```

## 안전한 화면 QA

운영 DB와 PG를 호출하지 않는 읽기 전용 화면 QA는 다음 환경에서 `/e2e/admin-payments-preview`를 사용한다.

```text
VERCEL_ENV=preview
PAYMENTS_ADMIN_E2E_PREVIEW=1
```

미리보기에는 72건의 고정 데이터가 들어 있으며 요청, 승인, 거절, 재대사 버튼은 실제 서버 작업을 실행하지 않는다.
