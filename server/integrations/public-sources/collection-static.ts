import { permittedBrowserRequest } from "./collection-http";
import { htmlSources, explicitReadCandidates } from "./collection-html";
import {
  enoughFields,
  evidenceText,
  jsonFields,
  meaningfulText,
  textFields,
} from "./collection-fields";
import type { CollectionContext } from "./collection-context";

export async function collectInitialContent(run: CollectionContext) {
  const { url, budget, noticeType, observations, stages, warnings } = run;
  stages.push("html-metadata-initial-state");
  try {
    const response = await budget.read(url);
    if (/json/.test(response.contentType)) {
      const value: unknown = JSON.parse(response.body.toString("utf8"));
      run.evidence = jsonFields(value, response.url, "api", noticeType).evidence;
      observations.push({ url: response.url, value });
    } else {
      const extracted = htmlSources(response.body.toString("utf8"), response.url, noticeType);
      ({
        text: run.text,
        evidence: run.evidence,
        scripts: run.scripts,
        inline: run.inline,
      } = extracted);
      observations.push(...extracted.observations);
      run.evidence.push(...textFields(run.text, response.url, "html", "body", noticeType));
    }
    if (enoughFields(run.evidence, noticeType) || meaningfulText(run.text, noticeType)) {
      return run.result(
        "static-html",
        [run.text, evidenceText(run.evidence, noticeType)].join("\n"),
        run.evidence,
      );
    }
  } catch {
    warnings.push("html_unavailable");
  }
}

export async function collectScriptObservations(run: CollectionContext) {
  const { url, budget, observations, scripts, inline, stages } = run;
  stages.push("linked-script-read-paths");
  const candidates = new Set(explicitReadCandidates(inline, url));
  for (const script of scripts) {
    try {
      if (!permittedBrowserRequest(script, "GET", "script")) continue;
      const response = await budget.read(script, true);
      if (!/javascript|text\/plain/.test(response.contentType)) continue;
      for (const candidate of explicitReadCandidates(response.body.toString("utf8"), url)) {
        candidates.add(candidate);
      }
    } catch {
      // 정적 읽기에 실패해도 브라우저에서 실제 요청을 관찰할 수 있다.
    }
  }
  for (const candidate of Array.from(candidates).slice(0, 6)) {
    try {
      if (!permittedBrowserRequest(candidate, "GET", "fetch")) continue;
      const response = await budget.read(candidate);
      if (/json/.test(response.contentType)) {
        observations.push({ url: response.url, value: JSON.parse(response.body.toString("utf8")) });
      }
    } catch {
      // 후보의 실패는 공개 API가 없다는 뜻이 아니므로 다음 수집 단계로 진행한다.
    }
  }
}
