import { notFound } from "next/navigation";
import { FileText, Download, Info } from "lucide-react";
import { createRouteClient } from "@/lib/db/clients";
import { CaseHeader } from "@/components/case/case-header";
import { PipelineStepper, type Step } from "@/components/case/pipeline-stepper";
import { CaseTabBar, CASE_TABS, type CaseTab } from "@/components/case/case-tabs";
import { ContextView } from "@/components/case/context-view";
import { DraftView } from "@/components/case/draft-view";
import { VerifyView } from "@/components/case/verify-view";
import { GateBar } from "@/components/case/gate-bar";
import { formatRelative } from "@/lib/time";
import { contextJsonToView, mdToSections, renderContextToSections, parseVerifyReport } from "@/lib/artifacts";
import { getCaseDetail } from "./data";
import { approveStage, requestChanges } from "./actions";

export const dynamic = "force-dynamic";

const STAGE_TAB_HINT: Partial<Record<CaseTab, string>> = {
  사건컨텍스트: "사건구성 단계 실행 후 생성됩니다.",
  리서치: "리서치 단계 실행 후 생성됩니다.",
  서면: "서면 작성 단계 실행 후 생성됩니다.",
  검증보고: "인용검증 단계 실행 후 생성됩니다.",
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default async function CaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; run?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab, run } = await searchParams;
  const tab: CaseTab = CASE_TABS.includes(rawTab as CaseTab) ? (rawTab as CaseTab) : "개요";

  const supabase = await createRouteClient();
  const { data: caseRow } = await supabase
    .from("cases")
    .select("id, title, status, created_at, assignee:profiles!cases_assignee_fkey(display_name)")
    .eq("id", id)
    .single();
  if (!caseRow) notFound();

  const { data: files } = await supabase
    .from("case_files")
    .select("id, kind, filename, storage_path, version, created_at")
    .eq("case_id", id)
    .order("created_at");

  const inputFiles = (files ?? []).filter((f) => f.kind === "입력");
  const signed = await Promise.all(
    inputFiles.map(async (f) => {
      const { data } = await supabase.storage.from("case-files").createSignedUrl(f.storage_path, 3600);
      return { ...f, url: data?.signedUrl };
    }),
  );

  const detail = await getCaseDetail(id);

  // 서면 버전 서명 URL
  const draftVersions = await Promise.all(
    detail.draftVersions.map(async (v, i) => ({
      label: `v${v.version}`,
      caption: v.filename,
      current: i === 0,
      href: (await supabase.storage.from("case-files").createSignedUrl(v.storagePath, 3600)).data?.signedUrl,
    })),
  );

  // P1: runs 데이터가 없으므로 항상 초기 상태 (Task 16에서 detail.stepStates로 전환)
  const steps: Step[] = [
    { label: "① 사건구성", caption: "실행 가능", state: "runnable" },
    { label: "② 리서치", caption: "잠김", state: "locked" },
    { label: "③ 소장 작성", caption: "잠김", state: "locked" },
    { label: "④ 인용검증", caption: "잠김", state: "locked" },
  ];

  return (
    <div className="flex flex-col gap-5 p-9">
      <CaseHeader title={caseRow.title} status={detail.caseStatus} assigneeName={caseRow.assignee?.display_name} />
      <PipelineStepper round="라운드 1 — 소장" steps={steps} onRunHref={`/cases/${id}?tab=개요&run=1`} />
      {run && (
        <div className="flex items-center gap-3 rounded-lg bg-app-tint p-4">
          <Info className="size-[18px] shrink-0 text-app-primary" />
          <span className="text-[13px] font-medium text-app-primary">
            에이전트 실행은 P2(실행 코어) 구현에서 연결됩니다 — 현재는 화면·데이터 기반만 준비된 상태입니다.
          </span>
        </div>
      )}
      <CaseTabBar active={tab} baseHref={`/cases/${id}`} />

      {tab === "개요" && (
        <div className="flex gap-6">
          <div className="flex flex-[2] flex-col gap-4 self-start rounded-lg border border-neutral-200 bg-white p-5">
            <span className="text-[15px] font-semibold text-neutral-950">최근 활동</span>
            <div className="flex flex-col">
              <div className="flex gap-3">
                <div className="flex w-4 flex-col items-center gap-1">
                  <span className="size-2.5 rounded-full border-2 border-app-primary bg-white" />
                  {signed.length > 0 && <span className="w-0.5 flex-1 bg-neutral-200" />}
                </div>
                <div className="flex flex-col gap-1 pb-5">
                  <span className="text-sm font-medium text-neutral-950">사건 등록됨</span>
                  <span className="text-xs text-neutral-500">{formatRelative(caseRow.created_at)}</span>
                </div>
              </div>
              {signed.length > 0 && (
                <div className="flex gap-3">
                  <div className="flex w-4 flex-col items-center">
                    <span className="size-2.5 rounded-full border-2 border-app-primary bg-white" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-neutral-950">입력 파일 {signed.length}개 업로드</span>
                    <span className="text-xs text-neutral-500">{formatRelative(signed[0].created_at)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex w-[420px] flex-col gap-4 self-start rounded-lg border border-neutral-200 bg-white p-5">
            <span className="text-[15px] font-semibold text-neutral-950">사건 정보</span>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">당사자</span>
              <span className="text-sm text-neutral-400">사건구성 실행 후 표시됩니다</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-neutral-500">등록일</span>
              <span className="text-sm font-medium text-neutral-950">
                {new Date(caseRow.created_at).toISOString().slice(0, 10)}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-neutral-500">입력 파일</span>
              {signed.map((f) => (
                <span key={f.id} className="flex items-center gap-2 rounded-lg bg-neutral-100 px-2.5 py-[7px]">
                  <FileText className="size-3.5 text-zinc-600" />
                  <span className="text-[13px] text-neutral-950">{f.filename}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "입력자료" && (
        <div className="flex flex-col gap-2">
          {signed.length === 0 ? (
            <EmptyCard message="입력 자료가 없습니다." />
          ) : (
            signed.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3"
              >
                <FileText className="size-4 text-zinc-600" />
                <span className="flex-1 text-sm font-medium text-neutral-950">{f.filename}</span>
                <span className="text-xs text-neutral-500">{formatRelative(f.created_at)}</span>
                {f.url && (
                  <a href={f.url} className="flex items-center gap-1.5 text-[13px] font-medium text-app-primary">
                    <Download className="size-4" />
                    다운로드
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "사건컨텍스트" &&
        (detail.artifacts["사건컨텍스트"]?.text ? (
          <div className="flex flex-col gap-4">
            {detail.stepStates.intake === "action" && !detail.activeRun && (
              <GateBar
                message="사건컨텍스트 검수 대기 — 승인하면 리서치가 잠금 해제됩니다"
                onApprove={approveStage.bind(null, id, detail.roundId, "intake")}
                onRequestChanges={requestChanges.bind(null, id, detail.roundId, "intake")}
              />
            )}
            <ContextView data={contextJsonToView(safeJson(detail.artifacts["사건컨텍스트"].text))} />
          </div>
        ) : (
          <EmptyCard message={`아직 생성되지 않았습니다 — ${STAGE_TAB_HINT["사건컨텍스트"]}`} />
        ))}

      {tab === "리서치" &&
        (detail.artifacts["리서치"]?.text ? (
          <div className="flex flex-col gap-4">
            {detail.stepStates.research === "action" && !detail.activeRun && (
              <GateBar
                message="리서치 검수 대기 — 승인하면 서면 작성이 잠금 해제됩니다"
                onApprove={approveStage.bind(null, id, detail.roundId, "research")}
                onRequestChanges={requestChanges.bind(null, id, detail.roundId, "research")}
              />
            )}
            <DraftView docTitle="쟁점별 법리" sections={mdToSections(detail.artifacts["리서치"].text)} versions={[]} />
          </div>
        ) : (
          <EmptyCard message={`아직 생성되지 않았습니다 — ${STAGE_TAB_HINT["리서치"]}`} />
        ))}

      {tab === "서면" &&
        (detail.artifacts["context_json"]?.text || draftVersions.length > 0 ? (
          <div className="flex flex-col gap-4">
            {detail.stepStates.draft === "action" && !detail.activeRun && (
              <GateBar
                message="서면 검수 대기 — 승인하면 인용검증이 잠금 해제됩니다"
                onApprove={approveStage.bind(null, id, detail.roundId, "draft")}
                onRequestChanges={requestChanges.bind(null, id, detail.roundId, "draft")}
              />
            )}
            <DraftView
              docTitle={detail.roundKind === "소장" ? "소장 초안" : "준비서면 초안"}
              sections={
                detail.artifacts["context_json"]?.text
                  ? renderContextToSections(safeJson(detail.artifacts["context_json"].text))
                  : []
              }
              versions={draftVersions}
            />
          </div>
        ) : (
          <EmptyCard message={`아직 생성되지 않았습니다 — ${STAGE_TAB_HINT["서면"]}`} />
        ))}

      {tab === "검증보고" &&
        (detail.artifacts["검증보고"]?.text ? (
          <div className="flex flex-col gap-4">
            {detail.stepStates.verify === "action" && !detail.verifyHasFail && !detail.activeRun && (
              <GateBar
                message="인용검증 통과 — 승인하면 라운드가 완료됩니다"
                onApprove={approveStage.bind(null, id, detail.roundId, "verify")}
                onRequestChanges={requestChanges.bind(null, id, detail.roundId, "verify")}
              />
            )}
            <VerifyView rows={parseVerifyReport(detail.artifacts["검증보고"].text).rows} />
          </div>
        ) : (
          <EmptyCard message={`아직 생성되지 않았습니다 — ${STAGE_TAB_HINT["검증보고"]}`} />
        ))}
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-neutral-200 bg-white p-16 text-sm text-neutral-500">
      {message}
    </div>
  );
}
