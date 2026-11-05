const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^\uFEFF/, ''));
const dataset = readJson('data/dataset.json');
const options = readJson('data/reference_options.json');
const geographies = readJson('data/geographies.json');
const topics = readJson('data/topic_taxonomy.json');
const legacyCoverage = readJson('data/coverage_profiles.json');
const legacyKnowledge = readJson('data/product_knowledge_v2.json');
const extension = readJson('data/extensions_20261104.json');
const productResearch = readJson('data/task4/product_knowledge_bundle.json');
const regulatory = readJson('data/task4/regulatory_web_bundle.json');
const hsTaxAudit = readJson('data/task4/hs_tax_audit.json');
const DOCUMENT_DIR = path.join(ROOT, 'documents', 'regulations');
const tables = dataset.tables;

const splitIds = (value) => Array.isArray(value) ? value : String(value || '').split(/[|;,]/).map((x) => x.trim()).filter(Boolean);
const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const groupMap = new Map(productResearch.groups.map((x) => [x.group_id, x]));
const categoryMap = new Map(productResearch.categories.map((x) => [x.category_id, x]));
const fieldMapResearch = new Map(productResearch.field_dictionary.map((x) => [x.field_id, x]));
const mappingsByProduct = new Map();
for (const mapping of productResearch.dynamic_field_map) {
  if (mapping.publication_status !== 'publishable') continue;
  if (!mappingsByProduct.has(mapping.subcategory_id)) mappingsByProduct.set(mapping.subcategory_id, []);
  mappingsByProduct.get(mapping.subcategory_id).push(mapping);
}

function optionValues(field) {
  const values = splitIds(field.options).sort((a,b) => (a === 'unknown' ? -1 : b === 'unknown' ? 1 : 0));
  const labels = { yes:['是','Yes'], no:['否','No'], unknown:['不确定','Not sure'] };
  return values.map((value) => ({
    value: value === 'yes' ? 'true' : value === 'no' ? 'false' : value === 'unknown' ? '' : value,
    label: labels[value]?.[0] || value,
    labelEn: labels[value]?.[1] || value
  }));
}

function runtimeField(mapping) {
  const field = fieldMapResearch.get(mapping.field_id);
  if (!field) return null;
  const type = ['number','integer'].includes(field.type) ? 'number' : 'select';
  return {
    fieldId: field.field_id, key: field.key, label: field.name_zh, labelEn: field.name_en,
    type, unit: field.unit || '', options: type === 'select' ? optionValues(field) : [],
    requiredFor: splitIds(mapping.affected_judgments), businessUse: mapping.business_use,
    askPolicy: mapping.ask_policy, sourceIds: splitIds(mapping.source_ids), unknownAllowed: field.unknown_allowed !== false,
    displayOrder: mapping.display_order, showWhen: (()=>{try{return JSON.parse(mapping.show_when||'{}')}catch{return {}}})()
  };
}

const templates = {};
const products = productResearch.subcategories.map((item) => {
  const group = groupMap.get(item.group_id) || {};
  const category = categoryMap.get(group.category_id) || {};
  const templateId = `TASK4-${item.subcategory_id}`;
  const fields = (mappingsByProduct.get(item.subcategory_id) || []).map(runtimeField).filter(Boolean).sort((a,b) => a.displayOrder-b.displayOrder);
  templates[templateId] = { id: templateId, label:item.name_zh, labelEn:item.name_en, fields, sourceIds:splitIds(item.source_ids) };
  const functions = splitIds(item.core_functions).map((label, i) => ({ value:`function_${i+1}`, label, labelEn: i === 0 ? item.name_en : label }));
  return {
    value:item.subcategory_id, subcategoryId:item.subcategory_id, legacyValue:item.legacy_product_type || null,
    label:item.name_zh, labelEn:item.name_en, group:group.name_zh || item.group_id, groupEn:group.name_en || group.name_zh || item.group_id,
    category:category.name_zh || '', categoryEn:category.name_en || '', templates:[templateId], functions,
    evidenceLevel:item.evidence_level, publicationStatus:item.evidence_level === 'M1' ? 'research_only' : 'production_candidate',
    boundaryZh:`${item.core_functions}；可变配置：${item.variable_configurations}`, boundaryEn:item.name_en,
    sourceIds:splitIds(item.source_ids), hsRelevantFeatures:item.hs_relevant_features, complianceFeatures:item.compliance_screen_features
  };
});
const productById = new Map(products.map((x) => [x.value, x]));
const productByLegacy = new Map(products.filter((x) => x.legacyValue).map((x) => [x.legacyValue, x]));

const jurisdictions = regulatory.jurisdictions;
const jurisdictionMap = new Map(jurisdictions.map((x) => [x.jurisdiction_code, x]));
function jurisdictionChain(code) {
  const result = new Set([code]);
  const row = jurisdictionMap.get(code);
  for (const inherited of row?.inherits_from || []) result.add(inherited);
  return [...result];
}

const linkedRuleIds = new Map();
for (const link of regulatory.product_rule_links) {
  if (!linkedRuleIds.has(link.subcategory_id)) linkedRuleIds.set(link.subcategory_id, new Set());
  linkedRuleIds.get(link.subcategory_id).add(link.rule_id);
}

const generatedActions = [];
const generatedMaterials = [];
const task3Rules = regulatory.rules.map((rule) => {
  if (rule.origin !== 'task3_verified_rule') return { ...rule, market:rule.jurisdiction || rule.market };
  const actionId = `ACT-${rule.rule_id}`;
  const materialIds = (rule.materials || []).map((name, i) => `MAT-${rule.rule_id}-${i+1}`);
  generatedActions.push({ action_id:actionId, 名称:rule.name, name_en:rule.name, 需执行动作:(rule.actions || []).join('；'), action_en:(rule.actions || []).join('; '), 责任建议:'制造商、进口商及合规负责人按角色确认', responsibility_en:'Manufacturer, importer and compliance owner by role', 完成节点:'投放市场或适用期限前', due_en:'Before placing on the market or the applicable deadline', 材料ID:materialIds, 来源ID:rule.source_ids || [] });
  (rule.materials || []).forEach((name, i) => generatedMaterials.push({ material_id:materialIds[i], 名称:name, name_en:name, 来源ID:rule.source_ids || [] }));
  return { ...rule, market:rule.jurisdiction, obligation:rule.applicable_result || (rule.actions || []).join('；'), action_ids:[actionId], material_ids:materialIds };
});
const preservedRules = [...(extension.tables?.['法规条件与义务规则'] || []), ...(legacyKnowledge.rules || [])]
  .map((rule)=>({...rule,jurisdiction:rule.jurisdiction||rule.market,origin:rule.origin||'preserved_v1_3_rule'}));
const normalizedRules = [...new Map([...task3Rules, ...preservedRules].map((rule)=>[rule.rule_id,rule])).values()];
const researchFields = productResearch.field_dictionary.map((x) => ({field_id:x.field_id,key:x.key,中文名:x.name_zh,name_en:x.name_en,type:x.type,追问:x.name_zh,question_en:x.name_en,影响:x.description||x.judgment_ids,来源ID:splitIds(x.source_ids),options:optionValues(x),unknown_allowed:x.unknown_allowed!==false}));
const regulatoryFields = regulatory.rule_input_fields.map((x) => ({field_id:`RF-${x.field_key}`,key:x.field_key,中文名:x.name_zh,name_en:x.name_en||x.name_zh,type:['tri_state','boolean'].includes(x.type)?'select':x.type,追问:x.name_zh,question_en:x.name_en||x.name_zh,影响:x.business_use,来源ID:[],options:['tri_state','boolean'].includes(x.type)?optionValues({options:'yes|no|unknown'}):[],unknown_allowed:x.unknown_allowed!==false}));
const allFields = [...new Map([...researchFields,...regulatoryFields].map((x)=>[x.key,x])).values()];

const legacyProfiles = [...legacyCoverage.profiles, ...(legacyKnowledge.coverageProfiles || [])];
const legacyProfileMap = new Map(legacyProfiles.map((x) => [`${x.market}|${x.product_type}`, x]));
const hsCandidates = [...new Map([...(tables['HS候选与归类依据'] || []), ...(extension.tables?.['HS候选与归类依据'] || []), ...(legacyKnowledge.hsCandidates || [])].map((x)=>[x.candidate_id,x])).values()];
const actions = [...new Map([...(tables['合规行动清单'] || []), ...(extension.tables?.['合规行动清单'] || []), ...(legacyKnowledge.actions || []), ...generatedActions].map((x) => [x.action_id,x])).values()];
const materials = [...new Map([...(tables['材料清单'] || []), ...(extension.tables?.['材料清单'] || []), ...(legacyKnowledge.materials || []), ...generatedMaterials].map((x) => [x.material_id,x])).values()];

function coverageFor(product, market) {
  const legacy = product?.legacyValue ? legacyProfileMap.get(`${market}|${product.legacyValue}`) : null;
  if (legacy?.level === 'L3') return { ...legacy, product_type:product.value, subcategory_id:product.value };
  if (legacy && product?.evidenceLevel !== 'M1') return { ...legacy, product_type:product.value, subcategory_id:product.value };
  const chain = jurisdictionChain(market);
  const linked = [...(linkedRuleIds.get(product?.value) || [])].some((id) => {
    const rule = normalizedRules.find((x) => x.rule_id === id);
    return rule && chain.includes(rule.jurisdiction || rule.market) && rule.origin === 'task3_verified_rule';
  });
  if (product?.evidenceLevel !== 'M1' && linked) return { market, product_type:product.value, subcategory_id:product.value, product_id:product.value, level:'L2', label:'条件初筛', labelEn:'Conditional screening' };
  return null;
}

const coverageProfiles = [];
for (const product of products) for (const market of jurisdictions.map((x) => x.jurisdiction_code)) {
  const profile = coverageFor(product, market); if (profile) coverageProfiles.push(profile);
}
const levelDefinitions = {
  L1:'提供法规来源与具体资料缺口，不输出确定的产品适用结论或完整税额。',
  L2:'根据已核规则和产品事实进行条件初筛，输出待确认事实、行动和材料；税费可能不完整。',
  L3:'在L2基础上，当前组合另有HS候选和已核税费画像，可复算已核分项。'
};
const levelDefinitionsEn = {
  L1:'Regulatory source navigation and explicit evidence gaps; no determinate product-specific conclusion or complete tax total.',
  L2:'Conditional screening using verified rules and product facts, with missing facts, actions and materials.',
  L3:'L2 plus destination HS candidates and a verified tax profile for reproducible known components.'
};

const indexedJurisdictions = new Set(regulatory.regulations.map((x) => x['法域']));
const runtimeJurisdictions = geographies.items.map((item) => {
  const task4Code = item.value === 'GB' ? 'UK_GB' : item.value;
  const j = jurisdictionMap.get(task4Code);
  return { ...item, value:task4Code, label:j?.name_zh || item.label, englishName:item.englishName || j?.name_zh, hasRegulationData:indexedJurisdictions.has(task4Code) || Boolean(j?.inherits_from?.some((x) => indexedJurisdictions.has(x))) };
});
const runtimeOptions = {
  ...options,
  products:[...products, {value:'OTHER',label:'其他小家电（仅登记）',labelEn:'Other small appliance (registration only)',group:'其他',groupEn:'Other',templates:[],functions:[],evidenceLevel:'M1',publicationStatus:'research_only'}],
  jurisdictions:runtimeJurisdictions,
  origins:[...runtimeJurisdictions.filter((x) => x.kind === 'country_or_territory').map((x) => ({value:x.value,label:x.label,englishName:x.englishName})),{value:'',label:'尚未确认',englishName:'Not confirmed'}]
};

const sourceMap = new Map(regulatory.sources.map((source) => [source.source_id, source]));
function sourceDocumentPath(sourceId) {
  if (!/^SRC-\d{3}$/.test(String(sourceId || ''))) return null;
  const file = path.join(DOCUMENT_DIR, `${sourceId}.pdf`); return fs.existsSync(file) ? file : null;
}
function decorateSource(source) {
  if (!source) return null; const file = sourceDocumentPath(source.source_id);
  return { ...source, title:source.title, url:source.current_url || source.original_url, verification:source.verification_status, pdf_kind:source.local_pdf_kind, has_local_pdf:Boolean(file), view_pdf_url:file?`/api/sources/${source.source_id}/file`:null, download_pdf_url:file?`/api/sources/${source.source_id}/file?download=1`:null };
}
function resolveSources(ids=[]) { return splitIds(ids).map((id) => decorateSource(sourceMap.get(id))).filter(Boolean); }

function table(name) {
  if (name === '法规条件与义务规则') return normalizedRules;
  if (name === '合规行动清单') return actions;
  if (name === '材料清单') return materials;
  if (name === 'HS候选与归类依据') return hsCandidates;
  if (name === '产品参数与动态追问') return allFields;
  if (name === '产品目录') return products.map((x) => ({product_id:x.value,product_type:x.value,名称:x.label,name_en:x.labelEn,证据等级:x.evidenceLevel,来源ID:x.sourceIds}));
  if (name === '来源状态全索引') return regulatory.sources.map(decorateSource);
  if (name === '法规索引_保留ID_更新') return regulatory.regulations;
  return tables[name] || [];
}

function bootstrap() {
  return {
    meta:{schemaVersion:'task4.1',dataAsOf:regulatory.as_of,timezone:dataset.timezone,scope:'条件初筛，非正式合规证明',appVersion:'1.4.0',localPdfCount:regulatory.sources.filter((x)=>sourceDocumentPath(x.source_id)).length},
    catalog15:Object.entries(products.reduce((g,p)=>{(g[p.group]||=[]).push(p.label);return g},{})).map(([group,items])=>({group,items})),
    options:runtimeOptions,
    coverageModel:{profiles:coverageProfiles,levelDefinitions,levelDefinitionsEn},
    productKnowledge:{schemaVersion:'task4.1',model:'subcategory evidence + dynamic fields',groups:Object.fromEntries(productResearch.groups.map((x)=>[x.group_id,{label:x.name_zh,labelEn:x.name_en}])),templates,products:runtimeOptions.products,sourcesNote:'Task 2 verified product evidence'},
    ruleModel:{schemaVersion:regulatory.schema_version,model:regulatory.model_key,generatedAt:regulatory.generated_at,ruleCount:normalizedRules.length},
    products:table('产品目录'),fields:table('产品参数与动态追问'),topics:topics.topics,rules:normalizedRules,actions,materials,hsCandidates,
    taxRules:table('税率税种与公式'),incoterms:table('贸易术语与费用承担'),coverage:regulatory.coverage_matrix,gaps:table('缺口与未核验事项'),
    sources:regulatory.sources.map(decorateSource),jurisdictions,productRuleLinks:regulatory.product_rule_links,hsTaxAudit,
    counts:{subcategories:products.length,publishableSubcategories:products.filter((x)=>x.evidenceLevel!=='M1').length,fields:productResearch.field_dictionary.length,fieldMappings:productResearch.dynamic_field_map.length,rules:normalizedRules.length,regulations:regulatory.regulations.length,sources:regulatory.sources.length}
  };
}

function searchPolicies({market='',topic='',q=''}={}) {
  const needle=String(q).normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim().toLowerCase().slice(0,120);
  const normalizedMarket=market==='GB'?'UK_GB':market;
  const chain=normalizedMarket&&normalizedMarket!=='ALL'?jurisdictionChain(normalizedMarket):[];
  return regulatory.regulations.filter((row)=>!chain.length||chain.includes(row['法域']))
    .filter((row)=>!topic||topic==='ALL'||String(row['监管主题']||'').split(/[;,]/).includes(topic))
    .filter((row)=>!needle||[row['法规ID'],row['名称'],row['编号'],row['法域'],row['制定或解释机构'],row['监管目的及核心义务'],row['适用产品族'],row['产品技术及适用条件'],row['相关条款或定位']].some((v)=>String(v||'').toLowerCase().includes(needle)))
    .slice(0,100).map((row)=>({...row,sources:resolveSources(row['来源ID'])}));
}
function getSourceDocument(sourceId){const source=sourceMap.get(sourceId),filePath=sourceDocumentPath(sourceId);return source&&filePath?{source:decorateSource(source),filePath}:null}
function getCase(caseId){return table('典型业务测试案例').find((x)=>x.case_id===caseId)||null}

module.exports={dataset,tables,table,sourceMap,resolveSources,getSourceDocument,bootstrap,searchPolicies,getCase,productById,productByLegacy,jurisdictionChain,linkedRuleIds,coverageFor};
