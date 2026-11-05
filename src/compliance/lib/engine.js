const UNKNOWN = 'unknown';
const SNAPSHOT_DATE = '2026-11-04';
const taxProfiles = require('../data/tax_calculation_profiles.json').profiles;
const { productById, productByLegacy, jurisdictionChain, linkedRuleIds } = require('./data');

function isUnknown(value) {
  return value === null || value === undefined || value === '';
}

function evaluateCondition(node, facts, missing = new Set()) {
  if (!node || !node.op) return true;
  const args = Array.isArray(node.args) ? node.args : [];

  if (node.op === 'all') {
    let sawUnknown = false;
    for (const arg of args) {
      const result = evaluateCondition(arg, facts, missing);
      if (result === false) return false;
      if (result === UNKNOWN) sawUnknown = true;
    }
    return sawUnknown ? UNKNOWN : true;
  }

  if (node.op === 'any') {
    let sawUnknown = false;
    for (const arg of args) {
      const result = evaluateCondition(arg, facts, missing);
      if (result === true) return true;
      if (result === UNKNOWN) sawUnknown = true;
    }
    return sawUnknown ? UNKNOWN : false;
  }

  const actual = facts[node.field];
  if (isUnknown(actual)) {
    missing.add(node.field);
    return UNKNOWN;
  }

  switch (node.op) {
    case 'eq': return actual === node.value;
    case 'ne': return actual !== node.value;
    case 'in': return Array.isArray(node.value) && node.value.includes(actual);
    case 'gt': return Number(actual) > Number(node.value);
    case 'ge': return Number(actual) >= Number(node.value);
    case 'le': return Number(actual) <= Number(node.value);
    case 'between': return Number(actual) >= Number(node.min) && Number(actual) <= Number(node.max);
    case 'contains_any': {
      const values = Array.isArray(actual) ? actual : String(actual).split(/[|;,]/).map((x) => x.trim());
      return Array.isArray(node.value) && node.value.some((value) => values.includes(value));
    }
    case 'date_ge': return String(actual) >= String(node.value);
    case 'date_le': return String(actual) <= String(node.value);
    default: return UNKNOWN;
  }
}

function statusFor(rule, conditionResult, exclusionResult) {
  if (exclusionResult === true) return 'not_applicable';
  if (conditionResult === false) return 'not_applicable';
  if (conditionResult === UNKNOWN) return 'unknown';
  if (rule.rule_status === 'review_required') return 'review_required';
  return 'applicable';
}

function evaluateRules(facts, rules) {
  return rules.map((rule) => {
    const missing = new Set();
    const conditionResult = evaluateCondition(rule.condition, facts, missing);
    const exclusionResult = rule.exclusions && typeof rule.exclusions === 'object'
      ? evaluateCondition(rule.exclusions, facts, missing)
      : false;
    return {
      ...rule,
      state: statusFor(rule, conditionResult, exclusionResult),
      conditionResult,
      missingFields: [...missing]
    };
  });
}

function profileFor(facts, profiles = []) {
  return profiles.find((row) => row.market === facts.market && row.product_type === (facts.subcategory_id || facts.product_type)) || null;
}

function evaluateScenario(facts, data) {
  const product = productById.get(facts.subcategory_id || facts.product_type) || productByLegacy.get(facts.product_type);
  const subcategoryId = product?.value || facts.subcategory_id || facts.product_type;
  const normalizedFacts = { ...facts, subcategory_id: subcategoryId, jurisdiction: facts.market, placing_on_market_date: facts.placing_on_market_date || facts.import_date };
  if (product?.legacyValue) normalizedFacts.product_type = product.legacyValue;
  if (normalizedFacts.wireless !== undefined && normalizedFacts.wireless_present === undefined) normalizedFacts.wireless_present = normalizedFacts.wireless;
  if (normalizedFacts.battery !== undefined && normalizedFacts.battery_present === undefined) normalizedFacts.battery_present = normalizedFacts.battery;
  if (normalizedFacts.end_use && normalizedFacts.consumer_product === undefined) normalizedFacts.consumer_product = normalizedFacts.end_use === 'consumer';
  if (normalizedFacts.channel && normalizedFacts.offered_online === undefined) normalizedFacts.offered_online = ['DTC','marketplace','online'].includes(normalizedFacts.channel);
  const chain = jurisdictionChain(facts.market);
  const links = linkedRuleIds.get(subcategoryId) || new Set();
  const candidateRules = data.rules.filter((rule) => {
    const jurisdiction = rule.jurisdiction || rule.market;
    if (!(jurisdiction === 'ALL' || chain.includes(jurisdiction))) return false;
    return rule.origin === 'task3_verified_rule' ? links.has(rule.rule_id) : true;
  });
  const asOf = normalizedFacts.placing_on_market_date || SNAPSHOT_DATE;
  const allResults = evaluateRules(normalizedFacts, candidateRules).map((result) => {
    const dateActive = (!result.effective_from || asOf >= result.effective_from) && (!result.effective_to || asOf <= result.effective_to);
    return dateActive ? result : { ...result, state:'not_applicable', dateActive:false, dateReason:`规则适用日期不覆盖 ${asOf}` };
  });
  const relevant = allResults;
  const applicableRules = relevant.filter((rule) => ['applicable', 'review_required'].includes(rule.state));
  const unknownRules = relevant.filter((rule) => rule.state === 'unknown');
  const actionIds = [...new Set(applicableRules.flatMap((rule) => rule.action_ids || []))];
  const materialIds = [...new Set(applicableRules.flatMap((rule) => rule.material_ids || []))];
  const sourceIds = [...new Set([...applicableRules, ...unknownRules].flatMap((rule) => rule.source_ids || []))];
  const coverageProfile = profileFor({ ...facts, subcategory_id:subcategoryId }, data.coverageProfiles);
  const legacyProductId = coverageProfile?.product_id || null;
  const hsCandidates = data.hsCandidates.filter((row) => row.market === facts.market && (
    row.subcategory_id === subcategoryId || row.product_id === subcategoryId || row.product_id === legacyProductId ||
    (product?.legacyValue && data.legacyProductIds?.[product.legacyValue] === row.product_id) || row.product_type === product?.legacyValue
  ));
  const missingFields = [...new Set(unknownRules.flatMap((rule) => rule.missingFields))];
  const productSpecificRules = relevant.filter((rule) => (rule.jurisdiction || rule.market) !== 'ALL');
  const gaps = [];
  if (!coverageProfile) gaps.push('当前产品与市场组合尚无产品特定结构化规则，仅可使用法规资料检索和通用风险提示。');
  if (coverageProfile && !hsCandidates.length) gaps.push('当前组合尚无经来源关联的目的国HS候选。');
  if (coverageProfile && !productSpecificRules.length) gaps.push('覆盖画像存在，但未找到对应产品的市场规则；请检查规则数据。');

  return {
    snapshotDate: SNAPSHOT_DATE,
    evaluated: true,
    supported: Boolean(coverageProfile && ['L2', 'L3'].includes(coverageProfile.level)),
    supportLevel: coverageProfile?.level || 'L1',
    coverage: {
      level: coverageProfile?.level || 'L1',
      label: coverageProfile?.label || '资料导航',
      definition: data.levelDefinitions?.[coverageProfile?.level || 'L1'] || '',
      gaps
    },
    ruleResults: relevant,
    applicableRules,
    unknownRules,
    actions: data.actions.filter((row) => actionIds.includes(row.action_id)),
    materials: data.materials.filter((row) => materialIds.includes(row.material_id)),
    hsCandidates,
    missingFields,
    questions: missingFields.map((key) => data.fields.find((field) => field.key === key)).filter(Boolean).map((field) => ({...field, affected_rules:unknownRules.filter((rule)=>rule.missingFields.includes(field.key)).map((rule)=>rule.rule_id)})),
    sourceIds
  };
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function validNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function toNativeCurrency(input, expectedCurrency, blockers) {
  if (input.currency === expectedCurrency) return { factor: 1, currency: expectedCurrency };
  const rate = input.fx_record && Number(input.fx_record.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    blockers.push(`币种为 ${input.currency || '未填'}，缺少转换为 ${expectedCurrency} 的法定汇率记录。`);
    return null;
  }
  if (!input.fx_record.source) {
    blockers.push(`已填写换算汇率，但缺少汇率来源及日期；不能作为可追溯的法定汇率记录。`);
  }
  return { factor: rate, currency: expectedCurrency };
}

function taxProfileFor(input) {
  const product = productById.get(input.subcategory_id || input.product_type) || productByLegacy.get(input.product_type);
  const legacy = product?.legacyValue || input.product_type;
  const hs = String(input.hs_candidate || '').replace(/\./g, '');
  const date = input.import_date || SNAPSHOT_DATE;
  return taxProfiles.find((row) => row.market === input.market
    && row.product_type === legacy
    && (!hs || hs.startsWith(String(row.hs).replace(/\./g,'')) || String(row.hs).replace(/\./g,'').startsWith(hs))
    && (!row.origin_scope || row.origin_scope === 'ANY' || row.origin_scope === input.origin)
    && (!row.effective_from || date >= row.effective_from)
    && (!row.effective_to || date <= row.effective_to)) || null;
}

function checkCommon(input, blockers, warnings) {
  if (!taxProfileFor(input)) blockers.push('当前产品市场组合没有已核税费计算画像。');
  if (!input.hs_candidate) blockers.push('尚未选择目的国 HS 候选；已知分项可作阶段测算，完整总额保持为空。');
  if (!input.origin) blockers.push('缺少原产地，不能确认税率情景。');
  if (!validNumber(input.goods_value)) blockers.push('货值/海关价值必须是非负数。');
  if (!input.import_date) blockers.push('缺少进口日期。');
  if (input.import_date && input.import_date > SNAPSHOT_DATE) warnings.push('进口日期晚于数据快照，税率、措施与规则版本需重新核验。');
  if (input.special_valuation === true || isUnknown(input.special_valuation)) blockers.push('特殊估价事实为是或未知，需先取得专业估价结论。');
}

function makeLine(id, label, classification, rate, base, amount, payer, sourceIds, status = 'calculated') {
  return { id, label, classification, rate, base, amount, payer, sourceIds, status };
}

function calculateSingapore(input) {
  const blockers = [];
  const warnings = [];
  checkCommon(input, blockers, warnings);
  const currencyInfo = toNativeCurrency(input, 'SGD', blockers);
  const factor = currencyInfo ? currencyInfo.factor : 1;
  const payer = input.incoterm === 'DDP' ? '卖方（合同承担；进口资格另核）' : '买方/进口申报主体';

  let customsValue = null;
  if (input.incoterm === 'DDP') {
    if (validNumber(input.confirmed_customs_value) && input.valuation_professionally_confirmed === true) {
      customsValue = input.confirmed_customs_value * factor;
    } else {
      blockers.push('DDP 含税总价不能倒算税基；需提供经专业确认的海关价值与费用拆分。');
    }
  } else if (input.price_basis === 'CIF_includes_TI' || input.incoterm === 'CIF') {
    customsValue = validNumber(input.goods_value) ? input.goods_value * factor : null;
  } else {
    if (!validNumber(input.freight) || !validNumber(input.insurance)) {
      blockers.push('FOB/未含运保价格缺少国际运费或保险费，无法确定 CIF 税基。');
    } else if (validNumber(input.goods_value)) {
      customsValue = (input.goods_value + input.freight + input.insurance) * factor;
    }
  }

  let gstBase = customsValue;
  if (input.multiple_sales === true) {
    if (validNumber(input.lsp) && input.last_buyer_is_declarant === true) gstBase = input.lsp * factor;
    else blockers.push('进口前多次销售需确认最后买方申报价及申报主体。');
  }

  const lowValueRoute = ['low_value', 'postal'].includes(input.import_route);
  if (lowValueRoute && !(input.gst_status && validNumber(input.consignment_cif) && input.gst_collection_record)) {
    blockers.push('低值空邮需补 GST 注册/征收状态、单件销售值、寄售 CIF 与已征税记录，不能仅按金额门槛判断免税。');
  }

  const profile = taxProfileFor(input);
  const dutyRate = profile?.ordinaryRate ?? null;
  const duty = dutyRate === 0 ? 0 : customsValue === null || dutyRate === null ? null : round2(customsValue * dutyRate);
  const gst = gstBase === null || duty === null || lowValueRoute || input.import_date > SNAPSHOT_DATE || input.special_valuation !== false || blockers.some((item) => item.includes('汇率')) ? null : round2((gstBase + duty) * 0.09);
  const permitFee = 0.9;
  const operatorFee = 2.29;
  const knownStatutorySubtotal = duty === null || gst === null ? null : round2(duty + gst + permitFee);
  const measuresConfirmed = input.remedy_check === 'confirmed_clear' || input.remedy_check === true;
  if (!measuresConfirmed) blockers.push('本票贸易救济/附加措施尚未确认，完整总额保持为空。');

  const lines = [
    makeLine('customs_value', '海关价值/CIF基础', '计税基础', null, '商品价及依法计入的国际运保', customsValue === null ? null : round2(customsValue), payer, ['SRC-172', 'SRC-174']),
    makeLine('ordinary_duty', '普通关税', '税', dutyRate, customsValue, duty, payer, profile?.sourceIds || ['SRC-170', 'SRC-168']),
    makeLine('import_gst', '进口 GST', '税', 0.09, gstBase, gst, payer, ['SRC-171', 'SRC-174', 'SRC-217'], gst === null ? 'blocked' : 'calculated'),
    makeLine('permit_fee', 'TradeNet 法定许可费', '法定规费', null, '按许可', permitFee, payer, ['SRC-202']),
    makeLine('operator_fee', '典型系统操作费', '操作费用', null, '按许可/消息', operatorFee, payer, ['SRC-202'], 'indicative')
  ];

  return {
    market: 'SG', currency: 'SGD', customs_value: customsValue === null ? null : round2(customsValue), gst_base: gstBase,
    ordinary_duty: duty, import_gst: gst, ordinary_tax_subtotal: gst === null ? null : round2(duty + gst),
    statutory_permit_fee: permitFee, indicative_operator_fee: operatorFee, known_statutory_subtotal: knownStatutorySubtotal,
    complete_total: blockers.length === 0 && measuresConfirmed ? knownStatutorySubtotal : null,
    lines, blockers: [...new Set(blockers)], warnings, assumptions: ['普通批量应税进口；无豁免、递延或保税安排', '许可费与操作费不属于统一税率'], snapshotDate: SNAPSHOT_DATE
  };
}

function calculateAustralia(input) {
  const blockers = [];
  const warnings = [];
  checkCommon(input, blockers, warnings);
  const currencyInfo = toNativeCurrency(input, 'AUD', blockers);
  const factor = currencyInfo ? currencyInfo.factor : 1;
  const payer = input.incoterm === 'DDP' ? '卖方（合同承担；进口资格另核）' : '买方/进口申报主体';
  const customsValueRaw = validNumber(input.customs_value_confirmed) ? input.customs_value_confirmed : input.goods_value;
  const customsValue = validNumber(customsValueRaw) ? round2(customsValueRaw * factor) : null;
  if (!validNumber(input.customs_value_confirmed)) warnings.push('海关价值未标记为专业确认，结果仅作阶段测算。');
  const lowValueImport = customsValue !== null && customsValue <= 1000;
  if (lowValueImport) blockers.push('海关价值不超过 AUD 1,000，通常适用低值进口/SAC路径；本版完整进口申报税费模型不直接套用。');
  if (!validNumber(input.freight) || !validNumber(input.insurance)) blockers.push('GST 基础缺少国际运费或保险费。');

  const eligiblePreference = input.origin_preference === 'reviewed'
    && input.origin_psr_satisfied === true
    && input.origin_documents_valid === true
    && input.transport_conditions_satisfied === true;
  if (input.origin_preference === 'reviewed' && !eligiblePreference) blockers.push('ChAFTA 优惠条件未全部确认，不能使用优惠税率。');
  const profile = taxProfileFor(input);
  const ordinaryRate = profile?.ordinaryRate ?? null;
  const rate = eligiblePreference ? 0 : ordinaryRate;
  const duty = rate === 0 ? 0 : customsValue === null || rate === null ? null : round2(customsValue * rate);
  const transportInsurance = validNumber(input.freight) && validNumber(input.insurance) ? round2((input.freight + input.insurance) * factor) : null;
  const gstBase = customsValue === null || duty === null || transportInsurance === null ? null : round2(customsValue + duty + transportInsurance);
  const gst = gstBase === null || lowValueImport || input.import_date > SNAPSHOT_DATE || input.special_valuation !== false || blockers.some((item) => item.includes('汇率')) ? null : round2(gstBase * 0.1);
  const ipc = customsValue === null ? null : customsValue >= 10000 ? 152 : customsValue > 1000 ? 50 : 0;
  let biosecurity = customsValue === null ? null : 0;
  if (customsValue > 1000) {
    if (input.import_date >= '2026-07-01') biosecurity = input.transport === 'air' ? 48 : input.transport === 'sea' ? 71 : null;
    else biosecurity = input.transport === 'air' ? 46 : input.transport === 'sea' ? 68 : null;
  }
  if (biosecurity === null) blockers.push('运输方式不足以确定生物安全费。');
  const knownStatutorySubtotal = [duty, gst, ipc, biosecurity].some((v) => v === null) ? null : round2(duty + gst + ipc + biosecurity);
  const measuresConfirmed = input.remedy_check === 'confirmed_clear' || input.remedy_check === true;
  if (!measuresConfirmed) blockers.push('本票贸易救济/附加措施尚未确认，完整总额保持为空。');
  if (input.sales_state !== 'VIC') warnings.push('VIC 电气安全结论不适用于未指定州或其他州；税费联邦分项仍可单独显示。');

  const lines = [
    makeLine('customs_value', '海关价值 CV', '计税基础', null, '经确认的 CV', customsValue, payer, ['SRC-177', 'SRC-233']),
    makeLine('ordinary_duty', eligiblePreference ? 'ChAFTA 条件关税' : '普通关税', '税', rate, customsValue, duty, payer, eligiblePreference ? ['SRC-233', 'SRC-235', 'SRC-236', 'SRC-237', 'SRC-238'] : (profile?.sourceIds || ['SRC-177'])),
    makeLine('import_gst', '进口 GST', '税', 0.1, gstBase, gst, payer, ['SRC-178', 'SRC-179'], gst === null ? 'blocked' : 'calculated'),
    makeLine('ipc', '进口处理费 IPC', '法定规费', null, customsValue, ipc, payer, ['SRC-180']),
    makeLine('biosecurity', '生物安全费', '法定规费', null, input.transport, biosecurity, payer, ['SRC-224'])
  ];

  return {
    market: 'AU', currency: 'AUD', customs_value: customsValue, ordinary_duty: duty, import_gst: gst,
    ordinary_tax_subtotal: duty === null || gst === null ? null : round2(duty + gst), ipc, biosecurity,
    default_preferential_rate_allowed: eligiblePreference,
    conditional_preferential_scenario: ['conditional', 'reviewed'].includes(input.origin_preference) && !eligiblePreference ? '仅列条件，不能已取得优惠' : null,
    preferential_duty_saving: ordinaryRate === 0 ? 0 : eligiblePreference && customsValue !== null && ordinaryRate !== null ? round2(customsValue * ordinaryRate) : null,
    known_statutory_subtotal: knownStatutorySubtotal,
    complete_total: blockers.length === 0 && measuresConfirmed ? knownStatutorySubtotal : null,
    lines, blockers: [...new Set(blockers)], warnings, assumptions: ['普通完整进口申报', eligiblePreference ? '优惠资格、证明与运输条件均由输入声明为已复核' : '按普通税率情景'], snapshotDate: SNAPSHOT_DATE
  };
}

function calculateTaxes(input) {
  if (input.market === 'SG') return calculateSingapore(input);
  if (input.market === 'AU') return calculateAustralia(input);
  return { market: input.market || null, currency: input.currency || null, lines: [], ordinary_duty: null, import_gst: null, known_statutory_subtotal: null, complete_total: null, blockers: ['当前市场仅提供资料检索，不支持金额计算。'], warnings: [], assumptions: [], snapshotDate: SNAPSHOT_DATE };
}

module.exports = {
  UNKNOWN,
  SNAPSHOT_DATE,
  isUnknown,
  evaluateCondition,
  evaluateRules,
  evaluateScenario,
  calculateTaxes,
  round2
};
