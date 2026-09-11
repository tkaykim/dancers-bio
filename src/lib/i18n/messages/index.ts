/**
 * 사전 네임스페이스 목록 — 타입만 내보낸다. 값 import 는 하지 않는다.
 *
 * 클라이언트 컴포넌트는 필요한 네임스페이스 모듈을 직접 import 한다
 * (`import project from "@/lib/i18n/messages/project"`). 그래야 그 컴포넌트가 쓰는
 * 사전만 번들에 실린다. 레지스트리 조회 방식은 전체 사전을 끌어들이므로 쓰지 않는다.
 * 서버 컴포넌트가 사전 객체를 클라이언트 컴포넌트 props 로 넘기지도 않는다(RSC 전송량).
 *
 * 네임스페이스 (docs/design-i18n-ui.md §3.4)
 *   common · nav · landing · auth · onboarding · feed · directory · profile · project ·
 *   me · applications · portfolio · labels · validation · actions · meta · ui · quick
 */
export type Namespace =
  | "common"
  | "nav"
  | "landing"
  | "auth"
  | "onboarding"
  | "feed"
  | "directory"
  | "profile"
  | "project"
  | "me"
  | "applications"
  | "portfolio"
  | "labels"
  | "validation"
  | "actions"
  | "meta"
  | "ui"
  | "quick";

export type { Messages, KeyOf, Translator } from "../t";
