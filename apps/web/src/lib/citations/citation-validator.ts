export type CitationMetadata = {
  citation_id: string;
  law_name: string;
  article: string;
  subordinate_rule?: string;
  effective_date: string;
  official_source_id: string;
  official_source_url?: string;
  retrieved_at: string;
  text_hash: string;
  rate?: string;
  applies_from?: string;
  applies_to?: string;
  verification_status: "verified" | "stale" | "unverified";
};

export type CitationLinkResult = {
  valid: boolean;
  unlinked_references: string[];
  linked_count: number;
};

export type TextComparisonResult = {
  match: boolean;
  diff_type?: "whitespace_only" | "substantive";
  normalized_match?: boolean;
};

export type CurrencyCheckResult = {
  current: boolean;
  status: "CURRENT" | "STALE_CITATION" | "UNKNOWN";
  stored_date: string;
  live_date?: string;
};

const LAW_WITH_ARTICLE =
  /(?:민법|상법|형법|소송촉진[^】]*특례법|[가-힣]+법)\s*제\d+조/g;
const LAW_NAME_ONLY =
  /소송촉진\s*(?:등에\s*관한\s*)?특례법|민법|상법|형법|[가-힣]{2,}법(?=이\s*정한|에\s*(?:따른|의한|규정))/g;

export function extractLawReferences(text: string): string[] {
  const withArticle = text.match(LAW_WITH_ARTICLE) ?? [];
  const nameOnly = text.match(LAW_NAME_ONLY) ?? [];
  const all = [...withArticle, ...nameOnly];
  return [...new Set(all)];
}

export function validateClaimCitationLinks(
  claims: string[],
  metadata: CitationMetadata[],
): CitationLinkResult {
  const allRefs: string[] = [];
  for (const claim of claims) {
    allRefs.push(...extractLawReferences(claim));
  }

  const unlinked: string[] = [];
  let linked = 0;

  for (const ref of allRefs) {
    const found = metadata.some((m) => {
      if (ref.includes(m.article)) {
        return ref.includes(m.law_name);
      }
      return ref.includes(m.law_name) || m.law_name.includes(ref);
    });
    if (found) {
      linked++;
    } else {
      unlinked.push(ref);
    }
  }

  return {
    valid: unlinked.length === 0 && allRefs.length > 0,
    unlinked_references: unlinked,
    linked_count: linked,
  };
}

export function hasInternalPins(text: string): boolean {
  return /\[출처:/.test(text) || /\[PIN:/.test(text) || /MST:\d+/.test(text);
}

export function compareWithOfficialText(
  citedText: string,
  officialText: string,
): TextComparisonResult {
  if (citedText === officialText) {
    return { match: true };
  }

  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const normCited = normalize(citedText);
  const normOfficial = normalize(officialText);

  if (normCited === normOfficial) {
    return { match: false, diff_type: "whitespace_only", normalized_match: true };
  }

  return { match: false, diff_type: "substantive", normalized_match: false };
}

export function checkCitationCurrency(
  metadata: CitationMetadata,
  currentEffectiveDate: string,
): CurrencyCheckResult {
  if (metadata.effective_date === currentEffectiveDate) {
    return { current: true, status: "CURRENT", stored_date: metadata.effective_date };
  }

  return {
    current: false,
    status: "STALE_CITATION",
    stored_date: metadata.effective_date,
    live_date: currentEffectiveDate,
  };
}
