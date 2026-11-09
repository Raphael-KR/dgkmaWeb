import type { NoticeType } from '@shared/contracts/notices';
import { assertSafeSourceUrl } from '../../modules/events/event-source-policy';
import { browserCollect } from './collection-browser';
import { CollectionBudget, permittedBrowserRequest } from './collection-http';
import { htmlSources, explicitReadCandidates } from './collection-html';
import { applyRule, buildRule, ruleUrl } from './collection-rules';
import { enoughFields, evidenceText, jsonFields, meaningfulText, textFields, hasEventIdentity } from './collection-fields';
import type { CollectionResult, FieldEvidence, JsonObservation, RuleStore } from './collection-contract';

/** All external bytes pass the same public-address/DNS/redirect/size checks. No LLM call. */
export async function collectPublicNotice(page: string, store: RuleStore, signal?: AbortSignal, noticeType: NoticeType = 'obituary'): Promise<CollectionResult> {
  const url = assertSafeSourceUrl(page).href;
  const budget = new CollectionBudget(signal);
  const stages: string[] = [], warnings: string[] = [];
  let browser = false, ocrImages = 0;
  let browserStats: CollectionResult['diagnostics']['browserStats'];
  const result = (method: CollectionResult['method'], text: string, evidence: FieldEvidence[], rule?: CollectionResult['diagnostics']['rule']): CollectionResult => ({
    method, text: text.slice(0, 40_000), evidence: evidence.slice(0, 100),
    diagnostics: { stages, requests: budget.requests, bytes: budget.bytes, browser, ocrImages, browserStats, rule, warnings },
  });
  stages.push('stored-rules');
  const saved = await store.find(new URL(url).hostname).catch(() => { warnings.push('rule_read_failed'); return []; });
  for (const entry of saved) {
    if (!(entry.rule.noticeTypes ?? ['obituary']).includes(noticeType)) continue;
    try {
      const endpoint = ruleUrl(entry.rule, url);
      if (!endpoint || !permittedBrowserRequest(endpoint, 'GET', 'fetch')) continue;
      const response = await budget.read(endpoint);
      if (!/json/.test(response.contentType)) throw Error('rule_content_type');
      const evidence = applyRule(entry.rule, JSON.parse(response.body.toString('utf8')), response.url, noticeType);
      if (!evidence) throw Error('rule_shape_changed');
      await store.succeeded(entry.id).catch(() => warnings.push('rule_touch_failed'));
      return result('stored-rule', evidenceText(evidence, noticeType), evidence, { id: entry.id, version: entry.version, reused: true });
    } catch { warnings.push('rule_stale'); }
  }

  const observations: JsonObservation[] = [];
  let text = '', evidence: FieldEvidence[] = [], scripts: string[] = [], inline = '';
  stages.push('html-metadata-initial-state');
  try {
    const response = await budget.read(url);
    if (/json/.test(response.contentType)) {
      const value: unknown = JSON.parse(response.body.toString('utf8'));
      evidence = jsonFields(value, response.url, 'api', noticeType).evidence;
      observations.push({ url: response.url, value, origin: 'html' });
    } else {
      const extracted = htmlSources(response.body.toString('utf8'), response.url, noticeType);
      ({ text, evidence, scripts, inline } = extracted);
      observations.push(...extracted.observations);
      evidence.push(...textFields(text, response.url, 'html', 'body', noticeType));
    }
    if (enoughFields(evidence, noticeType) || meaningfulText(text, noticeType)) return result('static-html', [text, evidenceText(evidence, noticeType)].join('\n'), evidence);
  } catch { warnings.push('html_unavailable'); }

  async function discovered(): Promise<CollectionResult | undefined> {
    for (const observation of observations.splice(0)) {
      try {
        const rule = buildRule(url, observation.url, observation.value, noticeType);
        if (!rule || !permittedBrowserRequest(observation.url, 'GET', 'fetch')) continue;
        // A browser observation alone is not a reusable rule: replay without cookies or auth.
        const response = await budget.read(ruleUrl(rule, url)!);
        if (!/json/.test(response.contentType)) continue;
        const found = applyRule(rule, JSON.parse(response.body.toString('utf8')), response.url, noticeType);
        if (!found) continue;
        stages.push('anonymous-api-replay');
        const persisted = await store.save(rule).catch(() => { warnings.push('rule_save_failed'); return undefined; });
        return result('discovered-api', [evidenceText(found, noticeType),browser?text:''].filter(Boolean).join('\n'), [...found,...(browser?evidence:[])], persisted && { ...persisted, reused: false });
      } catch { /* Not a confirmed reusable public read. Continue the other collection paths. */ }
    }
  }

  stages.push('linked-script-read-paths');
  const candidates = new Set(explicitReadCandidates(inline, url));
  for (const script of scripts) {
    try {
      if (!permittedBrowserRequest(script, 'GET', 'script')) continue;
      const response = await budget.read(script, true);
      if (!/javascript|text\/plain/.test(response.contentType)) continue;
      for (const candidate of explicitReadCandidates(response.body.toString('utf8'), url)) candidates.add(candidate);
    } catch { /* Rendering can still discover the actual request. */ }
  }
  for (const candidate of Array.from(candidates).slice(0, 6)) {
    try {
      if (!permittedBrowserRequest(candidate, 'GET', 'fetch')) continue;
      const response = await budget.read(candidate);
      if (/json/.test(response.contentType)) observations.push({ url: response.url, value: JSON.parse(response.body.toString('utf8')), origin: 'script' });
    } catch { /* Failed candidates do not mean that no public API exists. */ }
  }
  const staticApi = await discovered();
  if (staticApi) return staticApi;

  stages.push('playwright-fetch-xhr-render'); browser = true;
  try {
    const rendered = await browserCollect(url, budget, observations, noticeType);
    browserStats = rendered.stats; ocrImages = rendered.stats.ocrImages;
    if(!rendered.blocked) {
      text=rendered.segments.map(segment=>segment.text).join('\n');
      evidence=[...rendered.segments.flatMap(segment=>textFields(segment.text,segment.url,segment.kind,segment.locator,noticeType)),...evidence];
    }
    const api = await discovered();
    if (api) return api;
    if (rendered.blocked) warnings.push('access_challenge');
    else {
      if (meaningfulText(text, noticeType) || enoughFields(evidence, noticeType)) {
        if (ocrImages) stages.push('image-ocr');
        return result(ocrImages ? 'ocr' : 'browser', [text, evidenceText(evidence, noticeType)].join('\n'), evidence);
      }
    }
  } catch (error) {
    const code=error instanceof Error?error.message:'';
    warnings.push(['launch_failed','navigation_failed','render_failed','ocr_failed','collector_worker_exit','collector_browser_timeout','collector_capacity','collector_cancelled','collector_message_limit'].includes(code)?code:'browser_unavailable');
    const api = await discovered(); if (api) return api;
  }
  if(hasEventIdentity(evidence, noticeType)) {
    warnings.push('partial_event_facts');
    return result(browser?(ocrImages?'ocr':'browser'):'static-html',evidenceText(evidence, noticeType),evidence);
  }
  // Never label a 200 shell, navigation or challenge page as a collected event.
  throw new CollectionUnavailableError({ stages, warnings, requests: budget.requests, bytes: budget.bytes, browser, ocrImages, browserStats });
}

export class CollectionUnavailableError extends Error {
  constructor(public readonly diagnostics: CollectionResult['diagnostics']) { super('public_event_content_unavailable'); }
}
