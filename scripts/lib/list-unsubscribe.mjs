// 발송 스크립트용 재수출. 구현은 앱과 공유하는 정본 한 곳에만 있다.
// 스크립트에서는 `import { listUnsubscribeHeaders } from "./lib/list-unsubscribe.mjs"` 로 쓴다.
export {
  UNSUBSCRIBE_MAILBOX,
  UNSUBSCRIBE_ORIGIN,
  fetchUnsubscribePrefs,
  listUnsubscribeHeaders,
  unsubscribeUrl,
} from "../../src/lib/notify/list-unsubscribe.mjs";
