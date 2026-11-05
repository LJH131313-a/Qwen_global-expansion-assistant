const STORAGE_KEY = 'yuanjian-integrated:v1';

const state = {
  boot: null,
  scenario: {},
  taxInput: {},
  evaluation: null,
  evaluationStatus: 'idle',
  evaluationScenario: null,
  taxResult: null,
  actionStates: {},
  materialStates: {},
  hsSelection: null
};

const defaultScenario = {
  market: 'SG', product_type: 'K-BEV-001', main_function: null, household: null,
  end_use: null, voltage_ac: null, frequency_hz: null,
  power_kw: null, electrical_class: null, plug_type: null,
  detachable_cord: null, wireless: null, iot: null, battery: null, special_claim: null,
  complete_unit: null, set_goods: null, local_supplier: null, existing_registration: false,
  registration_expired: false, modified: false, channel: 'B2B', import_route: 'bulk',
  manufacturer_type: 'own_factory', importer_role: 'local_distributor', brand_owner_location: 'CN',
  special_valuation: false, import_date: '2026-11-03', origin: 'CN', specified_packaging: true,
  packaging_turnover: 5000000
};

const defaultTax = {
  origin: 'CN', quantity: 1000, currency: 'SGD', incoterm: 'FOB', transport: 'sea',
  goods_value: 20000, price_basis: 'FOB_excludes_TI', freight: 1500, insurance: 100,
  fx_rate: null, fx_source: '', multiple_sales: false, origin_preference: 'none', remedy_check: '', valuation_professionally_confirmed: false
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const text = (zh, en) => window.APP_I18N?.text(zh, en) || zh;
const itemText = (item, zhKey = 'label', enKey = 'labelEn') => window.APP_I18N?.item(item, zhKey, enKey) || item?.[zhKey];
const locale = () => window.APP_I18N?.locale || 'zh';
const applyLocale = (root = document) => window.APP_I18N?.apply(root);

function entityText(item, zhKey, enKey) {
  return locale() === 'en' ? (item?.[enKey] || item?.[zhKey] || '') : (item?.[zhKey] || '');
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch { return '#'; }
}

async function api(path, options = {}) { return window.localApi(path, options); }

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function navigate(name) {
  $$('.panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
  $$('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.nav === name));
  history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'report') renderReport();
}

function parseControl(control) {
  if (control.value === '') return null;
  if (control.type === 'number') return Number(control.value);
  if (control.value === 'true') return true;
  if (control.value === 'false') return false;
  return control.value;
}

function readForm(form) {
  const data = {};
  $$('[data-key]', form).forEach((control) => {
    if (control.closest('.conditional')?.hidden) return;
    data[control.dataset.key] = parseControl(control);
  });
  return data;
}

function setForms(data) {
  for (const [key, value] of Object.entries(data || {})) {
    $$(`[data-key="${CSS.escape(key)}"]`).forEach((control) => {
      if (value === null || value === undefined) control.value = '';
      else control.value = String(value);
    });
  }
  syncConditional();
}

function populateOptionSets() {
  const optionSets = state.boot.options || {};
  $$('[data-option-set]').forEach((select) => {
    const setName = select.dataset.optionSet;
    let items = optionSets[setName] || [];
    if (setName === 'policyJurisdictions') {
      items = [{ value: 'ALL', label: '全部法域', englishName: 'All jurisdictions', hasRegulationData: true }, ...(optionSets.jurisdictions || [])];
    }
    if (setName === 'jurisdictions' || setName === 'policyJurisdictions') {
      const indexed = items.filter((item) => item.value === 'ALL' || item.hasRegulationData);
      const unindexed = items.filter((item) => item.value !== 'ALL' && !item.hasRegulationData);
      select.innerHTML = `<optgroup label="${text('已有法规索引','Indexed regulatory data')}">${indexed.map((item) => `<option value="${esc(item.value)}">${esc(locale() === 'en' ? (item.englishName || item.labelEn || item.label) : item.label)}</option>`).join('')}</optgroup><optgroup label="${text('全球国家和地区（暂无产品规则）','Global countries and territories (no product rules yet)')}">${unindexed.map((item) => `<option value="${esc(item.value)}">${esc(locale() === 'en' ? (item.englishName || item.labelEn || item.label) : item.label)}</option>`).join('')}</optgroup>`;
      return;
    }
    if (setName === 'products') {
      const market = state.scenario.market || $('#scenario-form [data-key="market"]')?.value || 'SG';
      const groups = new Map();
      items.forEach((item) => {
        const group = locale() === 'en' ? (item.groupEn || item.group) : item.group;
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(item);
      });
      select.innerHTML = [...groups.entries()].map(([group, products]) => `<optgroup label="${esc(group)}">${products.map((item) => {
        const profile = state.boot.coverageModel.profiles.find((row) => row.market === market && row.product_type === item.value);
        const level = profile?.level || 'L1';
        const dot = level === 'L3' ? '🟢' : level === 'L2' ? '🟡' : '🔴';
        const label = level === 'L3' ? text('可测算','Calculation available') : level === 'L2' ? text('可初筛','Screening available') : text('资料导航','Source navigation');
        return `<option value="${esc(item.value)}">${dot} ${esc(itemText(item))} · ${label}</option>`;
      }).join('')}</optgroup>`).join('');
      return;
    }
    select.innerHTML = items.map((item) => `<option value="${esc(item.value)}">${esc(locale() === 'en' ? (item.labelEn || item.englishName || item.label) : item.label)}</option>`).join('');
  });
}

function optionLabel(setName, value) {
  const items = state.boot?.options?.[setName] || [];
  const item = items.find((entry) => entry.value === value);
  return (item ? (locale() === 'en' ? (item.labelEn || item.englishName || item.label) : item.label) : null) || value || text('未填写', 'Not provided');
}

function activeProduct() {
  return state.boot?.productKnowledge?.products?.find((item) => item.value === state.scenario.product_type)
    || state.boot?.productKnowledge?.products?.find((item) => item.value === $('#scenario-form [data-key="product_type"]')?.value);
}

function matchesDisplayCondition(node, facts) {
  if (!node || !node.op) return true;
  const args = node.args || [];
  if (node.op === 'all') return args.every((x) => matchesDisplayCondition(x, facts));
  if (node.op === 'any') return args.some((x) => matchesDisplayCondition(x, facts));
  const actual = node.field === 'subcategory_id' ? facts.product_type : facts[node.field];
  if (actual === null || actual === undefined || actual === '') return false;
  if (node.op === 'eq') return actual === node.value || String(actual) === String(node.value);
  if (node.op === 'in') return Array.isArray(node.value) && node.value.map(String).includes(String(actual));
  return true;
}

function renderProductFields({ preserve = true } = {}) {
  const product = activeProduct();
  const functionSelect = $('#main-function');
  const currentFunction = preserve ? (state.scenario.main_function || functionSelect.value) : '';
  const functionOptions = [{ value: '', label: '暂不清楚', labelEn: 'Not confirmed' }, ...(product?.functions || []), { value: 'other', label: '其他／组合功能', labelEn: 'Other or combined function' }];
  functionSelect.innerHTML = functionOptions.map((item) => `<option value="${esc(item.value)}">${esc(itemText(item))}</option>`).join('');
  functionSelect.value = functionOptions.some((item) => item.value === currentFunction) ? currentFunction : '';

  const fields = new Map();
  for (const templateId of product?.templates || []) {
    const template = state.boot.productKnowledge.templates[templateId];
    for (const field of template?.fields || []) if (!fields.has(field.key)) fields.set(field.key, field);
  }
  const root = $('#product-dynamic-fields');
  root.innerHTML = [...fields.values()].filter((field) => matchesDisplayCondition(field.showWhen, state.scenario)).map((field) => {
    const label = locale() === 'en' ? field.labelEn : field.label;
    if (field.type === 'select') {
      return `<label class="dynamic-field">${esc(label)}<select data-key="${esc(field.key)}">${(field.options || []).map((option) => `<option value="${esc(option.value)}">${esc(itemText(option))}</option>`).join('')}</select>${field.requiredFor?.length ? `<small>${text('用于：','Used for: ')}${esc(field.requiredFor.join(' / '))}</small>` : ''}</label>`;
    }
    return `<label class="dynamic-field">${esc(label)}${field.unit ? `（${esc(field.unit)}）` : ''}<input type="number" data-key="${esc(field.key)}" min="${esc(field.min ?? 0)}" step="${esc(field.step ?? 'any')}">${field.requiredFor?.length ? `<small>${text('用于：','Used for: ')}${esc(field.requiredFor.join(' / '))}</small>` : ''}</label>`;
  }).join('');
  setForms(state.scenario);
  applyLocale(root);
}

function combinedInputs() {
  return { ...state.scenario, ...state.taxInput };
}

function syncConditional() {
  const current = { ...state.scenario, ...readForm($('#scenario-form')), ...state.taxInput, ...readForm($('#tax-form')) };
  $$('.conditional').forEach((element) => {
    const [key, expected] = element.dataset.show.split(':');
    element.hidden = String(current[key]) !== expected;
  });
  const market = current.market || 'SG';
  const product = current.product_type;
  const profile = state.boot?.coverageModel?.profiles?.find((row) => row.market === market && row.product_type === product);
  const levelLabel = profile ? (locale() === 'en' ? (profile.labelEn || profile.label) : profile.label) : text('资料导航','Source navigation');
  const level = profile ? `${profile.level} ${levelLabel}` : `L1 ${levelLabel}`;
  $('#support-indicator').textContent = `${text('当前支持：','Current service: ')}${level}`;
  $('#product-support-note').textContent = profile?.level === 'L3' ? text('可进行条件初筛、HS候选和已核税费分项测算','Conditional screening, HS candidates and verified tax components') : profile ? text('可进行产品特定条件初筛','Product-specific conditional screening available') : text('当前提供法规资料与缺口导航','Regulatory sources and gap guidance only');
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      appVersion: state.boot?.meta?.appVersion,
      scenario: state.scenario, taxInput: state.taxInput, materialStates: state.materialStates,
      actionStates: state.actionStates, hsSelection: state.hsSelection, evaluation: state.evaluation, taxResult: state.taxResult,
      evaluationStatus: state.evaluationStatus, evaluationScenario: state.evaluationScenario
    }));
    const stateLabel = $('#draft-state');
    if (stateLabel) stateLabel.textContent = text('输入与清单状态已保存','Inputs and checklist status saved');
  } catch { const stateLabel = $('#draft-state'); if (stateLabel) stateLabel.textContent = text('浏览器未允许保存，请导出项目数据','Browser storage is unavailable; export the project data'); }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) {
      const versionChanged = saved.appVersion && saved.appVersion !== state.boot?.meta?.appVersion;
      Object.assign(state, saved);
      if (versionChanged) {
        state.evaluation = null;
        state.taxResult = null;
        state.hsSelection = null;
        state.evaluationStatus = 'idle';
      }
    }
  } catch { /* keep defaults */ }
  state.scenario = { ...defaultScenario, ...state.scenario };
  state.taxInput = { ...defaultTax, ...state.taxInput };
  state.actionStates ||= {};
  state.materialStates ||= {};
  if (state.evaluation && !state.evaluationStatus) state.evaluationStatus = 'complete';
}

function renderAbout() {
  const meta = state.boot.meta;
  $('#about-meta').innerHTML = `<p><b>${text('数据日期：','Data date: ')}</b>${esc(meta.dataAsOf)}</p><p><b>${text('数据版本：','Data version: ')}</b>${esc(meta.schemaVersion)}</p><p><b>${text('时区：','Time zone: ')}</b>${esc(meta.timezone)}</p><p><b>${text('结论口径：','Scope: ')}</b>${esc(meta.scope)}</p>`;
  $('#gap-list').innerHTML = state.boot.gaps.filter((gap) => gap.优先级 === 'P0').map((gap) => `
    <article class="result-card"><div class="result-card-head"><div><h3>${esc(gap.gap_id)} · ${esc(gap.未关闭事项)}</h3><p>${esc(gap.结果处理)}</p></div><span class="status unknown">${esc(gap.市场)}</span></div><p><b>补充动作：</b>${esc(gap.补充动作)}</p>${sourceLinks(gap.来源ID)}</article>`).join('');
}

function sourceById(id) {
  return state.boot.sources.find((source) => source.source_id === id);
}

function sourceLinks(ids = [], label = '查看法规依据') {
  const list = Array.isArray(ids) ? ids : String(ids || '').split(/[;,]/).filter(Boolean);
  const sources = [...new Map(list.map((id) => sourceById(id)).filter(Boolean).map((source) => [source.pdf_sha256 || source.source_id, source])).values()];
  const rows = sources.map((source) => {
    const url = safeUrl(source.url);
    const items = [];
    if (url !== '#') items.push(`<a class="source-link" href="${esc(url)}" target="_blank" rel="noreferrer">${text('官方网页 ↗','Official webpage ↗')}</a>`);
    if (source.has_local_pdf) {
      const kind = String(source.pdf_kind || '');
      const pdfLabel = kind.includes('官方托管原始') ? text('预览官方 PDF','Preview official PDF') : kind.includes('HTML') ? text('预览网页阅读版','Preview webpage reading copy') : text('预览核验卡','Preview verification copy');
      items.push(`<a class="source-link pdf" href="${esc(source.view_pdf_url)}" target="_blank" rel="noreferrer" title="${esc(source.pdf_kind || '本地 PDF')}">${esc(pdfLabel)}</a>`);
      items.push(`<a class="source-link pdf" href="${esc(source.download_pdf_url)}" download="${esc(source.source_id)}.pdf">${text('下载 PDF','Download PDF')}</a>`);
    }
    return `<div class="source-item"><div><b>${esc(source.source_id)} · ${esc(source.title)}</b><small>${esc(source.pdf_kind || source.verification || text('来源类型待核','Source type pending verification'))}</small></div><div class="source-actions">${items.join('') || `<span class="source-link">${text('仅有索引记录','Index record only')}</span>`}</div></div>`;
  });
  const labelEn = label === '查看法规依据' ? 'View regulatory sources' : label === '查看税费规则依据' ? 'View tax-rule sources' : label;
  return rows.length ? `<details class="source-panel"><summary>${esc(text(label, labelEn))} (${rows.length})</summary><div class="source-list">${rows.join('')}</div></details>` : '';
}

function statusLabel(stateName) {
  const labels = {
    applicable: ['适用','Applicable'], unknown: ['待补充','More information needed'],
    review_required: ['待规则核验','Rule review required'], not_applicable: ['不适用（仅此规则）','Not applicable to this rule']
  };
  return labels[stateName] ? text(...labels[stateName]) : stateName;
}

async function runEvaluation({ navigateAfter = true } = {}) {
  state.scenario = { ...defaultScenario, ...state.scenario, ...readForm($('#scenario-form')) };
  const evaluationFacts = { ...state.scenario, ...state.taxInput };
  state.evaluationStatus = 'running';
  renderEvaluation();
  try {
    state.evaluation = await api('/api/evaluate', { method: 'POST', body: JSON.stringify(evaluationFacts) });
    state.evaluationScenario = { ...evaluationFacts };
    state.evaluationStatus = 'complete';
    renderEvaluation();
    saveState();
    if (navigateAfter) navigate('compliance');
  } catch (error) {
    state.evaluationStatus = 'error';
    renderEvaluation();
    throw error;
  }
}

function renderEvaluation() {
  const result = state.evaluation;
  const empty = $('#evaluation-empty');
  if (!result) {
    empty.hidden = false;
    $('#evaluation-results').hidden = true;
    const title = empty.querySelector('h2');
    const copy = empty.querySelector('p');
    if (state.evaluationStatus === 'running') { title.textContent = text('正在运行初筛','Running screening'); copy.textContent = text('正在匹配产品规则、HS候选和行动材料。','Matching product rules, HS candidates, actions and materials.'); }
    else if (state.evaluationStatus === 'error') { title.textContent = text('初筛请求失败','Screening request failed'); copy.textContent = text('服务未返回有效结果，请确认已重启到当前版本后再试。','The service did not return a valid result. Restart the current version and try again.'); }
    else { title.textContent = text('尚未运行初筛','Screening has not been run'); copy.textContent = text('先登记产品与目标市场，系统才会基于结构化规则生成结果。','Register the product and target market before running structured screening.'); }
    applyLocale(empty);
    return;
  }
  $('#evaluation-empty').hidden = true;
  $('#evaluation-results').hidden = false;
  const coverage = result.coverage || { level: result.supportLevel, label: result.supported ? '结构化规则' : '资料导航', gaps: [] };
  const profile = state.boot.coverageModel.profiles.find((item) => item.market === state.scenario.market && item.product_type === state.scenario.product_type);
  const coverageLabel = locale() === 'en' ? (profile?.labelEn || coverage.label) : coverage.label;
  const coverageDefinition = locale() === 'en'
    ? (state.boot.coverageModel.levelDefinitionsEn?.[coverage.level] || coverage.definition)
    : coverage.definition;
  const stale = state.evaluationStatus === 'stale';
  $('#coverage-notice').innerHTML = stale
    ? `<div class="notice warning"><strong>${text('输入已变更。','Input has changed.')}</strong> ${text('当前展示的是上一次初筛结果，请重新运行后再据此准备材料或测算。','The previous result is shown. Run screening again before relying on it for preparation or calculation.')}</div>`
    : `<div class="notice ${result.supported ? 'info' : 'warning'}"><strong>${text('初筛已完成','Screening complete')} · ${esc(coverage.level)} ${esc(coverageLabel)}</strong> ${esc(coverageDefinition || '')}${coverage.gaps?.length ? `<ul>${coverage.gaps.map((gap) => `<li>${esc(gap)}</li>`).join('')}</ul>` : ''}</div>`;
  const applicable = result.ruleResults.filter((row) => row.state === 'applicable').length;
  const review = result.ruleResults.filter((row) => row.state === 'review_required').length;
  const unknown = result.ruleResults.filter((row) => row.state === 'unknown').length;
  $('#result-summary').innerHTML = `
    <article class="summary-card primary"><strong>${esc(result.supportLevel)}</strong><span>${result.supported ? text('当前组合已启用结构化规则','Structured rules are active for this combination') : text('当前组合仅提供法规资料索引','Regulatory source navigation only for this combination')}</span></article>
    <article class="summary-card"><strong>${applicable}</strong><span>${text('已触发要求','Triggered requirements')}</span></article>
    <article class="summary-card"><strong>${unknown}</strong><span>${text('待补充判断','Pending facts')}</span></article>
    <article class="summary-card"><strong>${review}</strong><span>${text('待规则核验','Rule review required')}</span></article>`;

  $('#question-block').innerHTML = result.questions.length ? `<div class="notice warning"><strong>${text('回答后将自动重新判断','Answers automatically refresh the affected rules')}</strong><p>${text('这里只询问会改变当前法规判断的缺失事实；不确定时可保留“不确定”。','Only missing facts that can change the current result are asked. Choose “Not sure” when the fact is unavailable.')}</p></div><div class="question-grid">${result.questions.map((q) => {
    const title = entityText(q,'追问','question_en') || entityText(q,'中文名','name_en');
    const options = q.options?.length ? q.options : [{value:'',label:'不确定',labelEn:'Not sure'},{value:'true',label:'是',labelEn:'Yes'},{value:'false',label:'否',labelEn:'No'}];
    return `<label class="question-card"><b>${esc(title)}</b><select data-question-key="${esc(q.key)}">${options.map((o)=>`<option value="${esc(o.value)}" ${String(state.scenario[q.key]??'')===String(o.value)?'selected':''}>${esc(itemText(o))}</option>`).join('')}</select><small>${text('影响：','Affects: ')}${esc((q.affected_rules||[]).join(' / '))}${q.影响?` · ${esc(q.影响)}`:''}</small></label>`;
  }).join('')}</div>` : '';

  $('#hs-results').innerHTML = result.hsCandidates.length ? result.hsCandidates.map((item) => `
    <div class="hs-option"><input type="radio" name="hs-candidate" id="${esc(item.candidate_id)}" value="${esc(item.code)}" ${state.hsSelection === item.code ? 'checked' : ''}><label class="result-card" for="${esc(item.candidate_id)}"><div class="result-card-head"><div><span class="code">${esc(item.code)}</span><h3>${esc(entityText(item,'description','description_en'))}</h3></div><span class="status review_required">${text('候选 · 非最终归类','Candidate · not a final classification')}</span></div><p><b>${text('支持事实：','Supporting facts: ')}</b>${esc(entityText(item,'support','support_en'))}</p><p><b>${text('需区分：','Questions to distinguish: ')}</b>${esc(entityText(item,'distinguishing_questions','distinguishing_questions_en'))}</p><p><b>${text('版本：','Version: ')}</b>${esc(item.tariff_version)} · ${esc(item.effective_as_of)}</p>${sourceLinks(item.source_ids)}</label></div>`).join('') : `<div class="notice warning">${text('当前组合没有事实相容的目的国 HS 候选；请使用法规资料检索并转人工归类。','No destination-country HS candidate is supported for this combination. Use the regulatory library and obtain a manual classification review.')}</div>`;

  const visibleRules = result.ruleResults.filter((row) => row.state !== 'not_applicable');
  $('#rule-results').innerHTML = visibleRules.length ? visibleRules.map((rule) => `
    <article class="result-card"><div class="result-card-head"><div><h3>${esc(rule.rule_id)} · ${esc(entityText(rule,'name','name_en'))}</h3><p>${esc(entityText(rule,'obligation','obligation_en'))}</p></div><span class="status ${esc(rule.state)}">${esc(statusLabel(rule.state))}</span></div>${rule.missingFields.length ? `<p><b>${text('缺失字段：','Missing fields: ')}</b>${rule.missingFields.map(esc).join(locale()==='en'?', ':'、')}</p>` : ''}<p><b>${text('依据定位：','Source location: ')}</b>${esc(entityText(rule,'locator','locator_en'))}</p><p><b>${text('证据边界：','Evidence boundary: ')}</b>${esc(entityText(rule,'human_review','human_review_en'))}</p>${sourceLinks(rule.source_ids)}</article>`).join('') : `<div class="notice info">${text('没有可显示的确定要求；这可能表示当前组合仅支持检索，不代表“无要求”。','No determinate requirement can be displayed. This may mean the combination supports source navigation only; it does not mean there are no requirements.')}</div>`;

  $('#todo-results').innerHTML = result.actions.length ? result.actions.map(renderAction) : `<div class="notice info">${text('当前没有可生成的行动清单。','No action list can be generated for this combination.')}</div>`;
  applyLocale($('#evaluation-results'));
}

function renderAction(action) {
  const materials = (action.材料ID || []).map((id) => state.evaluation.materials.find((material) => material.material_id === id)).filter(Boolean);
  const saved = state.actionStates[action.action_id] || { completed: false, status: '未开始' };
  const displayStatus = saved.completed ? text('企业称已完成','Company marked complete') : saved.status;
  return `<article class="result-card" data-action="${esc(action.action_id)}"><div class="result-card-head"><div><h3>${esc(action.action_id)} · ${esc(entityText(action,'名称','name_en'))}</h3><p>${esc(entityText(action,'需执行动作','action_en'))}</p></div><span class="status ${saved.completed ? 'applicable' : 'unknown'}">${esc(displayStatus)}</span></div><p><b>${text('责任建议：','Suggested owner: ')}</b>${esc(entityText(action,'责任建议','responsibility_en'))}　<b>${text('完成节点：','Due: ')}</b>${esc(entityText(action,'完成节点','due_en'))}</p><div class="action-controls"><label class="todo-check"><input type="checkbox" data-action-complete ${saved.completed ? 'checked' : ''}>${text('企业确认该行动已完成','Company confirms this action is complete')}</label><select data-action-status aria-label="${text('行动进度','Action progress')}"><option value="未开始" ${saved.status === '未开始' ? 'selected' : ''}>${text('未开始','Not started')}</option><option value="进行中" ${saved.status === '进行中' ? 'selected' : ''}>${text('进行中','In progress')}</option><option value="受阻" ${saved.status === '受阻' ? 'selected' : ''}>${text('受阻','Blocked')}</option><option value="企业称已完成" ${saved.status === '企业称已完成' ? 'selected' : ''}>${text('企业称已完成','Company marked complete')}</option></select></div><div class="todo-materials">${materials.map(renderMaterial).join('')}</div>${sourceLinks(action.来源ID)}</article>`;
}

function renderMaterial(material) {
  const saved = state.materialStates[material.material_id] || { preparation: '未提供', review: '未复核' };
  const checked = saved.preparation === '已提供';
  return `<div class="material-row" data-material="${esc(material.material_id)}"><div><label class="todo-check"><input type="checkbox" data-material-complete ${checked ? 'checked' : ''}><span><b>${esc(entityText(material,'名称','name_en'))}</b><small>${esc(material.material_id)}</small></span></label></div><select data-material-field="preparation" aria-label="${text('企业准备状态','Company preparation status')}"><option value="未提供" ${saved.preparation === '未提供' ? 'selected' : ''}>${text('未提供','Not provided')}</option><option value="企业称已准备" ${saved.preparation === '企业称已准备' ? 'selected' : ''}>${text('企业称已准备','Company states prepared')}</option><option value="已提供" ${saved.preparation === '已提供' ? 'selected' : ''}>${text('已提供','Provided')}</option><option value="不适用（企业声明）" ${saved.preparation === '不适用（企业声明）' ? 'selected' : ''}>${text('不适用（企业声明）','Not applicable (company statement)')}</option></select><select data-material-field="review" aria-label="${text('专业复核状态','Professional review status')}"><option value="未复核" ${saved.review === '未复核' ? 'selected' : ''}>${text('未复核','Not reviewed')}</option><option value="复核中" ${saved.review === '复核中' ? 'selected' : ''}>${text('复核中','Under review')}</option><option value="已复核" ${saved.review === '已复核' ? 'selected' : ''}>${text('已复核','Reviewed')}</option><option value="需整改" ${saved.review === '需整改' ? 'selected' : ''}>${text('需整改','Remediation required')}</option></select></div>`;
}

async function calculateTax() {
  state.taxInput = readForm($('#tax-form'));
  const input = { ...state.scenario, ...state.taxInput };
  if (Number.isFinite(input.fx_rate) && input.fx_rate > 0) input.fx_record = { rate: input.fx_rate, source: input.fx_source || null };
  if (state.scenario.market === 'AU' && input.valuation_professionally_confirmed === true && Number.isFinite(input.goods_value)) input.customs_value_confirmed = input.goods_value;
  if (input.hs_candidate === null && state.hsSelection) input.hs_candidate = state.hsSelection;
  state.taxResult = await api('/api/calculate', { method: 'POST', body: JSON.stringify(input) });
  renderTax();
  saveState();
}

function money(value, currency) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat(locale() === 'en' ? 'en-US' : 'zh-CN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}

function renderTax() {
  const result = state.taxResult;
  if (!result) return;
  const headline = result.complete_total !== null ? money(result.complete_total, result.currency) : money(result.known_statutory_subtotal, result.currency);
  const label = result.complete_total !== null ? '已确认法定合计' : '已核法定分项小计';
  $('#tax-output').innerHTML = `
    <div class="tax-total"><p>${esc(label)}</p><strong>${headline}</strong><small>${result.complete_total === null ? '完整总额不可用；请查看阻断项' : '输入与措施状态完整，可按相同输入复算'}</small></div>
    <div class="tax-lines">${result.lines.map((line) => `<div class="tax-line"><div><b>${esc(line.label)}</b><small>${esc(line.classification)} · ${esc(line.payer)}</small></div><div><small>税率 / 基础</small><b>${line.rate === null ? '—' : `${(line.rate * 100).toFixed(2)}%`}</b></div><div class="amount">${money(line.amount, result.currency)}</div></div>`).join('')}</div>
    ${result.blockers.length ? `<div class="blocker-list"><b>完整总额阻断</b><ul>${result.blockers.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>` : ''}
    ${result.warnings.length ? `<div class="warning-list"><b>仍需注意</b><ul>${result.warnings.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div>` : ''}
    ${sourceLinks([...new Set(result.lines.flatMap((line) => line.sourceIds || []))], '查看税费规则依据')}`;
  applyLocale($('#tax-output'));
}

async function searchPolicies() {
  const form = new FormData($('#policy-search'));
  const params = new URLSearchParams({ q: form.get('q') || '', market: form.get('market') || '', topic: form.get('topic') || '' });
  const result = await api(`/api/policies?${params}`);
  $('#policy-count').textContent = locale() === 'en'
    ? `${result.items.length} record(s) found in the regulatory index. Unmatched general terms are not sent to another knowledge base.`
    : `在法规索引中找到 ${result.items.length} 条记录；未命中的通用词不会转入其他知识库搜索。`;
  $('#policy-results').innerHTML = result.items.map((item) => `
    <article class="policy-card"><div class="jurisdiction">${esc(item.法域)}<br><small>${esc(item.文件性质)}</small></div><div><h3>${esc(item.法规ID)} · ${esc(item.名称)}</h3><p>${esc(item.监管目的及核心义务 || item.适用性与版本提示)}</p><p><b>${text('适用条件：','Applicability: ')}</b>${esc(item.产品技术及适用条件 || text('待进一步核验','Further verification required'))}</p>${sourceLinks(item.来源ID)}</div><div class="policy-meta"><b>${esc(item.核验状态)}</b><br>${esc(item.核查日期 || text('日期待核','Date pending'))}<br>${esc(item.相关条款或定位 || '')}<br><b>${text('版本状态：','Version status: ')}</b>${esc(item.修订及法律状态 || text('待核验','Pending verification'))}</div></article>`).join('') || `<div class="empty-state small"><p>${text('法规索引中没有匹配记录。请核对关键词或调整筛选条件。','No matching record was found in the regulatory index. Check the keyword or filters.')}</p></div>`;
  applyLocale($('#panel-policies'));
}

function renderReport() {
  if (!state.evaluation) return;
  const scenario = state.scenario;
  const rules = state.evaluation.ruleResults.filter((r) => r.state !== 'not_applicable');
  const actionRows = state.evaluation.actions.map((action) => ({ ...action, ...(state.actionStates[action.action_id] || { completed: false, status: '未开始' }) }));
  const materialRows = state.evaluation.materials.map((m) => ({ ...m, ...(state.materialStates[m.material_id] || { preparation: '未提供', review: '未复核' }) }));
  const tax = state.taxResult;
  $('#report-content').innerHTML = `
    <header class="report-cover"><p class="eyebrow">${text('政策合规与税费测算 · 阶段报告','Policy compliance and import-tax screening · Interim report')}</p><h1>${esc(scenario.product_name || optionLabel('products', scenario.product_type))}</h1><div class="report-meta"><span>${text('目标市场：','Target market: ')}${esc(optionLabel('jurisdictions', scenario.market))}</span><span>${text('型号：','Model: ')}${esc(scenario.sku || text('未填','Not provided'))}</span><span>${text('支持级别：','Service level: ')}${esc(state.evaluation.supportLevel)}</span><span>${text('资料核验日期：','Sources verified through: ')}${esc(state.evaluation.snapshotDate)}</span><span>${text('生成时间：','Generated: ')}${esc(new Date().toLocaleString(locale() === 'en' ? 'en-GB' : 'zh-CN'))}</span></div></header>
    <section class="report-section"><h2>一、范围与关键结论</h2><p>本报告为条件初筛，不是符合性证明。当前显示 ${rules.filter((r) => r.state === 'applicable').length} 项适用要求、${rules.filter((r) => r.state === 'unknown').length} 项待补充、${rules.filter((r) => r.state === 'review_required').length} 项待规则核验。</p><p><b>关键未决字段：</b>${state.evaluation.missingFields.length ? state.evaluation.missingFields.map(esc).join('、') : '无结构化缺失字段；仍需关闭证据与专业复核事项。'}</p></section>
    <section class="report-section"><h2>二、HS 候选与复核</h2><table class="report-table"><thead><tr><th>选用编码</th><th>状态</th><th>说明</th></tr></thead><tbody><tr><td>${esc(state.hsSelection || '未选择')}</td><td>用户选用作估算 / 专业复核未完成</td><td>最终归类以目的国海关或专业复核为准。</td></tr></tbody></table></section>
    <section class="report-section"><h2>三、法规适用性</h2><table class="report-table"><thead><tr><th>规则</th><th>状态</th><th>行动/依据</th></tr></thead><tbody>${rules.map((r) => `<tr><td>${esc(r.rule_id)} · ${esc(entityText(r,'name','name_en'))}</td><td>${esc(statusLabel(r.state))}</td><td>${esc(entityText(r,'obligation','obligation_en'))}<br>${esc(entityText(r,'locator','locator_en'))}</td></tr>`).join('')}</tbody></table></section>
    <section class="report-section"><h2>四、合规行动进度</h2><table class="report-table"><thead><tr><th>行动</th><th>企业记录状态</th><th>责任建议</th></tr></thead><tbody>${actionRows.map((a) => `<tr><td>${esc(a.action_id)} · ${esc(entityText(a,'名称','name_en'))}</td><td>${esc(a.completed ? text('企业称已完成','Company marked complete') : a.status)}</td><td>${esc(entityText(a,'责任建议','responsibility_en'))}</td></tr>`).join('')}</tbody></table></section>
    <section class="report-section"><h2>五、材料准备与专业复核</h2><table class="report-table"><thead><tr><th>材料</th><th>企业准备</th><th>专业复核</th></tr></thead><tbody>${materialRows.map((m) => `<tr><td>${esc(m.material_id)} · ${esc(entityText(m,'名称','name_en'))}</td><td>${esc(m.preparation)}</td><td>${esc(m.review)}</td></tr>`).join('')}</tbody></table></section>
    <section class="report-section"><h2>六、税费分项与情景</h2>${tax ? `<table class="report-table"><thead><tr><th>项目</th><th>税率</th><th>金额</th><th>承担主体</th></tr></thead><tbody>${tax.lines.map((line) => `<tr><td>${esc(line.label)}</td><td>${line.rate === null ? '—' : `${(line.rate * 100).toFixed(2)}%`}</td><td>${money(line.amount, tax.currency)}</td><td>${esc(line.payer)}</td></tr>`).join('')}</tbody></table><p><b>已核法定分项小计：</b>${money(tax.known_statutory_subtotal, tax.currency)}　<b>完整总额：</b>${tax.complete_total === null ? '不可用' : money(tax.complete_total, tax.currency)}</p>${tax.blockers.length ? `<p><b>阻断：</b>${tax.blockers.map(esc).join('；')}</p>` : ''}` : '<p>尚未运行税费测算。</p>'}</section>
    <section class="report-section"><h2>七、证据边界与未支持范围</h2><p>适用性、企业准备与专业复核是三个独立维度。当前数据未关闭的贸易救济、合并法规正文、ACMA/其他州、标准版本、企业真实证书、特殊估价及法定汇率等问题，不应由本报告自动补足。</p></section>
    <footer class="report-section"><p>数据快照 2026-11-04 · 结果可按相同输入复算 · 请在正式进口、投放或合同承诺前由关务、CAB、税务或法律专业人员复核。</p></footer>`;
  applyLocale($('#report-content'));
}

function exportJson() {
  const payload = { exportedAt: new Date().toISOString(), dataAsOf: state.boot.meta.dataAsOf, scenario: state.scenario, evaluation: state.evaluation, actionStates: state.actionStates, materialStates: state.materialStates, hsSelection: state.hsSelection, taxInput: state.taxInput, taxResult: state.taxResult };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `合规初筛项目_${state.scenario.sku || 'draft'}_${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav]');
    if (nav) { event.preventDefault(); navigate(nav.dataset.nav); }
  });
  $('#scenario-form').addEventListener('input', (event) => {
    const previousProduct = state.scenario.product_type;
    const previous = state.boot.productKnowledge.products.find((item) => item.value === previousProduct);
    state.scenario = { ...state.scenario, ...readForm($('#scenario-form')) };
    if (event.target.dataset.key === 'product_type' && state.scenario.product_type !== previousProduct) {
      for (const templateId of previous?.templates || []) for (const field of state.boot.productKnowledge.templates[templateId]?.fields || []) delete state.scenario[field.key];
      state.scenario.main_function = null;
      renderProductFields({ preserve: false });
    } else if (event.target.closest('#product-dynamic-fields')) {
      renderProductFields({ preserve: true });
    }
    if (event.target.dataset.key === 'market') { populateOptionSets(); setForms(state.scenario); }
    if (state.evaluation) state.evaluationStatus = 'stale';
    if (state.scenario.market === 'SG' && state.taxInput.currency === 'AUD') state.taxInput.currency = 'SGD';
    if (state.scenario.market === 'AU' && state.taxInput.currency === 'SGD') state.taxInput.currency = 'AUD';
    setForms(state.taxInput);
    syncConditional();
    saveState();
  });
  $('#scenario-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await runEvaluation(); } catch (error) { showToast(error.message); } });
  $('#scenario-form').addEventListener('reset', () => {
    setTimeout(() => { state.scenario = { ...defaultScenario }; state.evaluation = null; state.evaluationStatus = 'idle'; state.evaluationScenario = null; state.actionStates = {}; state.materialStates = {}; setForms(state.scenario); renderEvaluation(); saveState(); }, 0);
  });
  $('#tax-form').addEventListener('input', () => { state.taxInput = readForm($('#tax-form')); syncConditional(); saveState(); });
  $('#tax-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await calculateTax(); } catch (error) { showToast(error.message); } });
  $('#evaluation-results').addEventListener('change', (event) => {
    if (event.target.dataset.questionKey) {
      state.scenario[event.target.dataset.questionKey] = parseControl(event.target);
      runEvaluation({ navigateAfter:false }).then(()=>showToast(text('相关判断已更新','Affected results updated'))).catch((error)=>showToast(error.message));
      return;
    }
    if (event.target.name === 'hs-candidate') {
      state.hsSelection = event.target.value;
      state.taxInput.hs_candidate = event.target.value;
      setForms(state.taxInput);
      saveState();
      showToast(`已选用 ${event.target.value} 作为估算候选`);
    }
    const row = event.target.closest('[data-material]');
    if (row && event.target.hasAttribute('data-material-complete')) {
      const id = row.dataset.material;
      state.materialStates[id] ||= { preparation: '未提供', review: '未复核' };
      state.materialStates[id].preparation = event.target.checked ? '已提供' : '未提供';
      renderEvaluation();
      saveState();
      showToast(event.target.checked ? '材料已标记为“已提供”' : '材料完成标记已取消');
      return;
    }
    if (row && event.target.dataset.materialField) {
      const id = row.dataset.material;
      state.materialStates[id] ||= { preparation: '未提供', review: '未复核' };
      state.materialStates[id][event.target.dataset.materialField] = event.target.value;
      renderEvaluation();
      saveState();
      return;
    }
    const actionCard = event.target.closest('[data-action]');
    if (actionCard && (event.target.hasAttribute('data-action-complete') || event.target.hasAttribute('data-action-status'))) {
      const id = actionCard.dataset.action;
      state.actionStates[id] ||= { completed: false, status: '未开始' };
      if (event.target.hasAttribute('data-action-complete')) {
        state.actionStates[id].completed = event.target.checked;
        state.actionStates[id].status = event.target.checked ? '企业称已完成' : '未开始';
      } else {
        state.actionStates[id].status = event.target.value;
        state.actionStates[id].completed = event.target.value === '企业称已完成';
      }
      renderEvaluation();
      saveState();
      showToast('行动进度已保存到本机浏览器');
    }
  });
  $('#policy-search').addEventListener('submit', async (event) => { event.preventDefault(); try { await searchPolicies(); } catch (error) { showToast(error.message); } });
  $('#language-switch').addEventListener('click', () => window.APP_I18N.setLocale(locale() === 'en' ? 'zh' : 'en'));
  $('#export-json').addEventListener('click', exportJson);
  $('#refresh-report').addEventListener('click', renderReport);
  $('#print-report').addEventListener('click', () => { renderReport(); window.print(); });
}

async function init() {
  state.boot = await api('/api/bootstrap');
  populateOptionSets();
  loadState();
  renderProductFields();
  renderAbout();
  $('#topic-filter').insertAdjacentHTML('beforeend', state.boot.topics.map((topic) => `<option value="${esc(topic.topic_id)}">${esc(locale() === 'en' ? (topic.name_en || topic.名称) : topic.名称)}</option>`).join(''));
  $('#policy-library-count').textContent = locale() === 'en' ? `${state.boot.counts.regulations} indexed regulations` : `${state.boot.counts.regulations} 条法规索引`;
  setForms({ ...state.scenario, ...state.taxInput });
  if (state.evaluation) renderEvaluation();
  if (state.taxResult) renderTax();
  bindEvents();
  window.addEventListener('app:locale-change', () => {
    populateOptionSets();
    renderProductFields();
    setForms({ ...state.scenario, ...state.taxInput });
    if ($('.snapshot')) $('.snapshot').innerHTML = `<i></i> ${text('资料核验至','Sources verified through')} ${esc(state.boot.meta.dataAsOf)}`;
    $('#topic-filter').innerHTML = `<option value="ALL">${text('全部主题','All topics')}</option>${state.boot.topics.map((topic) => `<option value="${esc(topic.topic_id)}">${esc(locale() === 'en' ? (topic.name_en || topic.名称) : topic.名称)}</option>`).join('')}`;
    renderAbout();
    if (state.evaluation) renderEvaluation();
    if (state.taxResult) renderTax();
    renderReport();
    applyLocale(document);
    searchPolicies().catch((error) => showToast(error.message));
  });
  if ($('.snapshot')) $('.snapshot').innerHTML = `<i></i> ${text('资料核验至','Sources verified through')} ${esc(state.boot.meta.dataAsOf)}`;
  applyLocale(document);
  await searchPolicies();
  const startPanel = location.hash.slice(1);
  if (startPanel && $(`[data-panel="${CSS.escape(startPanel)}"]`)) navigate(startPanel);
}

init().catch((error) => {
  console.error(error);
  $('#toast').textContent = `应用初始化失败：${error.message}`;
  $('#toast').classList.add('show');
});
