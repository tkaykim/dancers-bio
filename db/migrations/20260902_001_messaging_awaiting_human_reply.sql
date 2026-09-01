-- 미답변(awaiting_staff_since) 해제 조건 교정 — Codex 라운드 6 발견(상).
--
-- 문제: 기존 트리거는 sender_role='team' 이면 무조건 미답변을 해제했다.
--       캠페인(kind notice/action_request)도 team 으로 삽입되므로, 지원자의
--       질문에 답하지 않은 채 공지만 보내도 SLA 가 조용히 종료됐다.
-- 교정: 사람의 직접 답장(team + kind='text')만 미답변을 해제한다.
--       캠페인·응답요청·시스템 메시지는 미답변 상태를 건드리지 않는다.
--       (명시적 해제는 resolveThreadAction 이 그대로 담당)

create or replace function public.trg_chat_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq bigint;
begin
  update public.chat_rooms
     set last_seq = last_seq + 1,
         last_message_at = now(),
         updated_at = now(),
         awaiting_staff_since = case
           when new.sender_role = 'member' then coalesce(awaiting_staff_since, now())
           -- 사람의 직접 답장만 미답변을 해제한다. 캠페인(notice/action_request)·system 은 유지.
           when new.sender_role = 'team' and new.kind = 'text' then null
           else awaiting_staff_since
         end,
         resolved_at = case
           when new.sender_role = 'member' then null
           else resolved_at
         end
   where id = new.room_id
   returning last_seq into v_seq;

  if v_seq is null then
    raise exception 'chat room % not found', new.room_id;
  end if;

  new.room_seq := v_seq;
  if new.created_at is null then
    new.created_at := now();
  end if;
  return new;
end;
$$;
