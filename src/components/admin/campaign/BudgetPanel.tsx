"use client";
import Link from "next/link";
import { useState } from "react";
import { budgetSummary,type BudgetData } from "@/lib/campaign/budget";
import { saveBudgetAction } from "@/app/actions/campaign-budget";
import { Editor,ErrorText,inputClass,buttonClass,useAction } from "./Controls";
import { number,tableClass } from "@/components/campaign/ResultsReport";
const won=(n:number|null|undefined)=>n==null?"미확인":`${number(n)}원`;
const amount=(value:FormDataEntryValue|null)=>value===""||value===null?null:Number(value);
export function BudgetPanel({data}:{data:BudgetData}) {
  const summary=budgetSummary(data);
  const finance=data.canViewFinance===true;
  const [search,setSearch]=useState("");
  const [missingOnly,setMissingOnly]=useState(false);
  const [message,setMessage]=useState("");
  const action=useAction();
  const project=data.settings.project_id;
  const cards=[
    ["운영 예산",won(data.settings.total_amount),"아래 확인 근거의 금액 기준"],
    ["필요 예상액 · 확인분",won(summary.knownRequired),`금액 미확인 ${summary.unpriced}명 제외`],
    ["확인분 차감 후 잔액",won(summary.remaining),summary.complete?"입력된 금액 기준":"미확인 금액이 있어 최종 잔여 예산이 아닙니다."],
    ["합의 출연료",won(summary.agreedTotal),`${summary.agreedCount}/${summary.rows.length}명 합의 금액 입력`],
    ["정산 등록액",won(summary.registeredTotal),"지급 완료액과 다릅니다."],
    ["운영비 · 예비비 확보",won(summary.operations),"예약액과 등록 실비 중 큰 값"],
  ];
  return <section className="space-y-5" aria-label="캠페인 예산">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{finance?"예산 소요 현황":"출연료 편성"}</h2><p className="text-xs text-ink-3">{finance?"전체 재무 요약은 대표 전용입니다.":"담당 캠페인의 참여자별 출연료를 편성합니다."} 클라이언트 보드와 참여자에게 공개되지 않습니다.</p></div>
      {finance&&<Link className={buttonClass} href={`/projects/${project}/settlements`}>정산·지급 현황 ↗</Link>}</div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{(finance?cards:[cards[3],["금액 미확인",`${summary.unpriced}명`,"별도 연락한 참여자도 수기 추가 후 입력할 수 있습니다."]]).map(([label,value,detail])=><div key={label} className="rounded-2xl border border-border p-4"><p className="text-xs text-ink-3">{label}</p><p className="my-2 break-words text-xl font-bold tabular-nums">{value}</p><p className="text-xs text-ink-3">{detail}</p></div>)}</div>
    {finance&&(!summary.complete || summary.outsideCount>0) && <p className="rounded-xl bg-secondary p-4 text-sm">{summary.unpriced}명의 출연료와 {summary.operations===null?"운영비·예비비가 미확인입니다.":"운영비 입력 기준을 확인해 주세요."}
      {summary.outsideCount>0 && <span className="block">현재 참여자의 출연료와 연결되지 않은 정산 {summary.outsideCount}건({won(summary.otherRegistered)})도 예상액에 포함했습니다.</span>}
      {summary.unsettledAmounts>0 && <span className="block">금액이 없는 정산 {summary.unsettledAmounts}건은 합계에 포함하지 못했습니다.</span>}</p>}
    <p className="text-xs leading-relaxed text-ink-3">{finance&&<>필요 예상액은 참여자별 입력 금액과 출연료 정산 등록액 중 큰 값에 기타 정산·운영비 확보액을 더합니다.<br/></>}희망 단가는 참고값이며 예상액에 자동 합산하지 않습니다.<br/>모든 입력은 원화 기준이며 정산 확정이나 지급은 실행되지 않습니다.</p>
    {finance&&<Editor title="예산·운영비 설정"><form key={data.settings.version} className="space-y-4" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);setMessage("");action.run(()=>saveBudgetAction(project,"configure",{version:data.settings.version,total_amount:amount(form.get("total")),operations_reserve:amount(form.get("operations")),basis:form.get("basis")}),()=>setMessage("예산 설정을 저장했습니다."));}}>
      <label className="block text-sm">운영 예산 (원)<input name="total" type="number" min="0" step="1" max="1000000000000" defaultValue={data.settings.total_amount??""} className={`${inputClass} mt-1 w-full`}/></label>
      <label className="block text-sm">운영비·예비비 확보액 (원)<input name="operations" type="number" min="0" step="1" max="1000000000000" defaultValue={data.settings.operations_reserve??""} className={`${inputClass} mt-1 w-full`}/></label>
      <label className="block text-sm">확인 근거·금액 기준<textarea name="basis" required maxLength={2000} defaultValue={data.settings.basis} className={`${inputClass} mt-1 w-full`} placeholder="합의 날짜와 세금 포함 여부 등을 기록해 주세요."/></label>
      <button disabled={action.pending} className={buttonClass}>설정 저장</button><ErrorText error={action.error}/><p role="status">{message}</p>
    </form></Editor>}
    {data.settings.basis && <p className="whitespace-pre-line rounded-xl border border-border p-4 text-sm">{data.settings.basis}</p>}
    <div className="flex flex-wrap items-center gap-3"><input aria-label="예산 참여자 검색" className={inputClass} value={search} onChange={e=>setSearch(e.target.value)} placeholder="참여자 이름 검색"/><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={missingOnly} onChange={e=>setMissingOnly(e.target.checked)}/>금액 미확인만</label></div>
    <div className="overflow-x-auto"><table className={tableClass}><thead><tr>{["참여자","희망 단가 · 참고","입력 금액","상태",...(finance?["정산 등록","필요 예상액"]:[]),"관리"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{summary.rows.filter(r=>r.participant.display_name.toLowerCase().includes(search.toLowerCase())&&(!missingOnly||r.required===null)).map(row=><tr key={row.participant.id}>
      <td>{row.participant.display_name}</td><td>{row.quote?.proposed_fee!=null?`${number(row.quote.proposed_fee)} ${row.quote.proposed_fee_currency??"통화 미확인"} / ${row.quote.proposed_fee_unit??"단위 미확인"}`:"미등록"}</td><td>{won(row.fee?.amount)}</td><td>{row.fee?.amount==null?"미확인":row.fee.status==="agreed"?"합의 완료":"협의 예상"}</td>{finance&&<><td>{won(row.registered)}</td><td>{won(row.required)}</td></>}<td><FeeEditor project={project} row={row}/></td>
    </tr>)}</tbody></table></div>
  </section>;
}
function FeeEditor({project,row}:{project:string;row:ReturnType<typeof budgetSummary>["rows"][number]}) {
  const [open,setOpen]=useState(false);
  const action=useAction();
  return <Editor title="금액 입력" open={open} onOpenChange={setOpen}><form key={row.fee?.version??0} className="space-y-4" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);action.run(()=>saveBudgetAction(project,"fee",{participant_id:row.participant.id,version:row.fee?.version??0,amount:amount(form.get("amount")),status:form.get("status"),note:form.get("note")}),()=>setOpen(false));}}>
    <p className="font-semibold">{row.participant.display_name}</p><p className="text-xs text-ink-3">해당 참여자의 전체 출연료 소요액을 입력합니다.<br/>정산 확정이나 지급은 실행되지 않습니다.</p>
    <label className="block text-sm">예상 총지출 (원)<input name="amount" type="number" min="0" step="1" max="1000000000000" defaultValue={row.fee?.amount??""} className={`${inputClass} mt-1 w-full`}/></label>
    <p className="text-xs text-ink-3">무료 참여가 합의된 경우 0원을 입력하고, 아직 모르면 비워 둡니다.</p>
    <label className="block text-sm">금액 상태<select name="status" defaultValue={row.fee?.status??"estimate"} className={`${inputClass} ml-2`}><option value="estimate">협의 예상</option><option value="agreed">합의 완료</option></select></label>
    <label className="block text-sm">확인 근거·변경 사유<textarea name="note" required maxLength={2000} defaultValue={row.fee?.note??""} className={`${inputClass} mt-1 w-full`} placeholder="합의 내용, 지급 대상과 세금 기준을 기록해 주세요."/></label>
    <ErrorText error={action.error}/><button disabled={action.pending} className={buttonClass}>금액 저장</button>
  </form></Editor>;
}
