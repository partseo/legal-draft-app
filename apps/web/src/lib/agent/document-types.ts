/**
 * Frozen Document Type Registry — P5.5-4
 *
 * supportedAuthorModes는 Template과 문구의 기술적 지원 여부다.
 * 법률상 소송대리·수임·제출 권한을 자동으로 부여하거나 보증하지 않는다.
 */

type AuthorMode = "lawyer" | "judicial_scrivener";

type OutputDefinition = {
  readonly filename: string;
  readonly template: string;
  readonly projectionType: string;
  readonly contextExample: string;
  readonly kind: "서면" | "검증보고" | "context_json";
  readonly required: boolean;
};

type StagePolicy = {
  readonly intake: "required";
  readonly research: "required" | "optional" | "skipped";
  readonly draft: "required";
  readonly verify: "required" | "conditional";
};

export type DocumentTypeDefinition = {
  readonly id: string;
  readonly label: string;
  readonly category:
    | "litigation"
    | "notice"
    | "provisional_remedy"
    | "enforcement"
    | "registration"
    | "rehabilitation"
    | "bankruptcy";
  readonly draftSkill: string;
  readonly verifySkill: string;
  readonly outputs: readonly OutputDefinition[];
  readonly stagePolicy: StagePolicy;
  readonly supportedAuthorModes: readonly AuthorMode[];
  readonly existingWebSupport: boolean;
};

function out(
  filename: string,
  template: string,
  projectionType: string,
  contextExample: string,
  kind: OutputDefinition["kind"] = "서면",
  required = true,
): OutputDefinition {
  return { filename, template, projectionType, contextExample, kind, required };
}

const BOTH_MODES: readonly AuthorMode[] = ["lawyer", "judicial_scrivener"] as const;

const DOCUMENT_TYPES: readonly DocumentTypeDefinition[] = [
  {
    id: "소장",
    label: "소장",
    category: "litigation",
    draftSkill: "draft-complaint",
    verifySkill: "verify-citations",
    outputs: [
      out("소장_초안.docx", "소장_템플릿_docxtpl.docx", "소장", "context_소장_예시.json"),
    ],
    stagePolicy: { intake: "required", research: "required", draft: "required", verify: "required" },
    supportedAuthorModes: BOTH_MODES,
    existingWebSupport: true,
  },
  {
    id: "준비서면",
    label: "준비서면",
    category: "litigation",
    draftSkill: "draft-brief",
    verifySkill: "verify-citations",
    outputs: [
      out("준비서면_초안.docx", "준비서면_템플릿_docxtpl.docx", "준비서면", "context_준비서면_예시.json"),
    ],
    stagePolicy: { intake: "required", research: "required", draft: "required", verify: "required" },
    supportedAuthorModes: BOTH_MODES,
    existingWebSupport: true,
  },
  {
    id: "내용증명",
    label: "내용증명",
    category: "notice",
    draftSkill: "draft-demand-letter",
    verifySkill: "verify-citations",
    outputs: [
      out("내용증명_초안.docx", "내용증명_템플릿_docxtpl.docx", "내용증명", "context_내용증명_예시.json"),
    ],
    stagePolicy: { intake: "required", research: "optional", draft: "required", verify: "conditional" },
    supportedAuthorModes: BOTH_MODES,
    existingWebSupport: false,
  },
  {
    id: "가압류신청서",
    label: "가압류신청서",
    category: "provisional_remedy",
    draftSkill: "draft-injunction",
    verifySkill: "verify-citations",
    outputs: [
      out("가압류신청서_초안.docx", "가압류신청서_템플릿_docxtpl.docx", "가압류신청서", "context_가압류_예시.json"),
    ],
    stagePolicy: { intake: "required", research: "required", draft: "required", verify: "required" },
    supportedAuthorModes: BOTH_MODES,
    existingWebSupport: false,
  },
  {
    id: "가처분신청서",
    label: "가처분신청서",
    category: "provisional_remedy",
    draftSkill: "draft-injunction",
    verifySkill: "verify-citations",
    outputs: [
      out("가처분신청서_초안.docx", "가처분신청서_템플릿_docxtpl.docx", "가처분신청서", "context_가처분_예시.json"),
    ],
    stagePolicy: { intake: "required", research: "required", draft: "required", verify: "required" },
    supportedAuthorModes: BOTH_MODES,
    existingWebSupport: false,
  },
  {
    id: "강제집행신청서",
    label: "강제집행신청서",
    category: "enforcement",
    draftSkill: "draft-execution",
    verifySkill: "verify-citations",
    outputs: [
      out("강제집행신청서_초안.docx", "강제집행신청서_템플릿_docxtpl.docx", "강제집행신청서", "context_강제집행_예시.json"),
    ],
    stagePolicy: { intake: "required", research: "skipped", draft: "required", verify: "conditional" },
    supportedAuthorModes: BOTH_MODES,
    existingWebSupport: false,
  },
  {
    id: "등기신청서_소유권이전",
    label: "등기신청서 (소유권이전)",
    category: "registration",
    draftSkill: "draft-registration",
    verifySkill: "check-registration",
    outputs: [
      out("등기신청서_소유권이전_초안.docx", "등기신청서_소유권이전_템플릿_docxtpl.docx", "등기신청서_소유권이전", "context_등기신청서_소유권이전_예시.json"),
    ],
    stagePolicy: { intake: "required", research: "optional", draft: "required", verify: "required" },
    supportedAuthorModes: BOTH_MODES,
    existingWebSupport: false,
  },
  {
    id: "등기신청서_근저당설정",
    label: "등기신청서 (근저당설정)",
    category: "registration",
    draftSkill: "draft-registration",
    verifySkill: "check-registration",
    outputs: [
      out("등기신청서_근저당설정_초안.docx", "등기신청서_근저당설정_템플릿_docxtpl.docx", "등기신청서_근저당설정", "context_등기신청서_근저당설정_예시.json"),
    ],
    stagePolicy: { intake: "required", research: "optional", draft: "required", verify: "required" },
    supportedAuthorModes: BOTH_MODES,
    existingWebSupport: false,
  },
  {
    id: "등기신청서_법인변경",
    label: "등기신청서 (법인변경)",
    category: "registration",
    draftSkill: "draft-registration",
    verifySkill: "check-registration",
    outputs: [
      out("등기신청서_법인변경_초안.docx", "등기신청서_법인변경_템플릿_docxtpl.docx", "등기신청서_법인변경", "context_등기신청서_법인변경_예시.json"),
    ],
    stagePolicy: { intake: "required", research: "optional", draft: "required", verify: "required" },
    supportedAuthorModes: BOTH_MODES,
    existingWebSupport: false,
  },
  {
    id: "개인회생신청서",
    label: "개인회생신청서",
    category: "rehabilitation",
    draftSkill: "draft-rehabilitation",
    verifySkill: "verify-citations",
    outputs: [
      out("개인회생신청서_초안.docx", "개인회생신청서_템플릿_docxtpl.docx", "개인회생신청서", "context_개인회생신청서_예시.json"),
      out("채권자목록.docx", "채권자목록_템플릿_docxtpl.docx", "채권자목록", "context_채권자목록_예시.json"),
      out("재산목록.docx", "재산목록_템플릿_docxtpl.docx", "재산목록", "context_재산목록_예시.json"),
      out("수입지출목록.docx", "수입지출목록_템플릿_docxtpl.docx", "수입지출목록", "context_수입지출목록_예시.json"),
      out("변제계획안.docx", "변제계획안_템플릿_docxtpl.docx", "변제계획안", "context_변제계획안_예시.json"),
    ],
    stagePolicy: { intake: "required", research: "optional", draft: "required", verify: "required" },
    supportedAuthorModes: BOTH_MODES,
    existingWebSupport: false,
  },
  {
    id: "파산면책신청서",
    label: "파산면책신청서",
    category: "bankruptcy",
    draftSkill: "draft-bankruptcy",
    verifySkill: "verify-citations",
    outputs: [
      out("파산면책신청서_초안.docx", "파산면책신청서_템플릿_docxtpl.docx", "파산면책신청서", "context_파산면책신청서_예시.json"),
      out("채권자목록.docx", "채권자목록_템플릿_docxtpl.docx", "채권자목록", "context_채권자목록_예시.json"),
      out("재산목록.docx", "재산목록_템플릿_docxtpl.docx", "재산목록", "context_재산목록_예시.json"),
    ],
    stagePolicy: { intake: "required", research: "optional", draft: "required", verify: "required" },
    supportedAuthorModes: BOTH_MODES,
    existingWebSupport: false,
  },
] as const;

const typeMap = new Map(DOCUMENT_TYPES.map((t) => [t.id, t]));

export function getDocumentType(id: string): DocumentTypeDefinition | undefined {
  return typeMap.get(id);
}

export function listDocumentTypes(): readonly DocumentTypeDefinition[] {
  return DOCUMENT_TYPES;
}

export function getDraftSkill(id: string): string | undefined {
  return typeMap.get(id)?.draftSkill;
}

export function getVerifySkill(id: string): string | undefined {
  return typeMap.get(id)?.verifySkill;
}

export function getRequiredOutputs(id: string): readonly OutputDefinition[] | undefined {
  const t = typeMap.get(id);
  return t ? t.outputs.filter((o) => o.required) : undefined;
}

export function isExistingWebDocumentType(id: string): boolean {
  return typeMap.get(id)?.existingWebSupport === true;
}
