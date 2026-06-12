#!/usr/bin/env python3
"""docxtpl 템플릿 → 서면 docx 렌더링.

사용법:
    pip install docxtpl
    python3 render_서면.py <템플릿.docx> <context.json> <출력.docx>

예시:
    python3 render_서면.py 소장_템플릿_docxtpl.docx context_소장_예시.json 소장_샘플.docx
    python3 render_서면.py 준비서면_템플릿_docxtpl.docx context_준비서면_예시.json 준비서면_샘플.docx

실습(AGENT-002 STEP 5-B 연계):
    에이전트가 산출물/소장_관계법령_법리.md 내용을 context JSON의 청구원인(또는 본문)
    배열에 채워 넣은 뒤 이 스크립트를 실행하면 법원 양식 그대로의 워드 초안이 나온다.
"""
import json
import sys

from docxtpl import DocxTemplate


def main() -> None:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    template_path, context_path, output_path = sys.argv[1:4]

    with open(context_path, encoding="utf-8") as f:
        context = json.load(f)

    doc = DocxTemplate(template_path)
    doc.render(context)
    doc.save(output_path)
    print(f"렌더링 완료: {output_path}")


if __name__ == "__main__":
    main()
