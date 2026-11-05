# 数据目录说明

本目录同时包含正式运行数据、同步数据和构建/校验文件。是否位于 `data/` 不能单独证明它已被网页使用。

## 正式运行读取

- `dataset.json`：旧正式业务快照，保留 HS 候选、行动、材料及兼容数据。
- `reference_options.json`、`geographies.json`、`topic_taxonomy.json`：选项、法域和监管主题。
- `coverage_profiles.json`、`product_knowledge_v2.json`、`extensions_20261104.json`：旧覆盖画像、产品知识和扩展规则，仍由兼容层读取。
- `tax_calculation_profiles.json`：当前 8 个 SG/AU 税费画像。
- `task4/product_knowledge_bundle.json`：任务二产品分类、字段和映射的同步快照。
- `task4/regulatory_web_bundle.json`：任务三法规、来源、规则、法域、候选关联和覆盖矩阵的同步快照。
- `task4/hs_tax_audit.json`、`task4/id_mapping.json`：税费审计和新旧 ID 映射。

具体读取关系见 `lib/data.js` 和 `lib/engine.js`。当前仍采用兼容合并方式，不能删除旧正式文件。

## 构建与校验

- `dataset.schema.json`、`regulatory_rule.schema.json`：数据校验 schema。
- `regulatory_rules.normalized.json`：`scripts/build_regulatory_model.js` 的构建产物；当前 v1.4 运行时并不直接读取它，但旧测试和构建流程仍有参考价值。
- `task4/product_validation_report.json`、`regulatory_validation_report.json`：上游同步时的引用、ID、哈希和场景校验结果。
- `task4/sync_manifest.json`：同步来源、文件大小和生成时间。

## 更新原则

1. 先在独立产品/法规研究库维护来源和证据。
2. 运行 `npm run sync:task4` 生成同步快照。
3. 运行 `npm run audit:maintenance` 更新详细缺口清单。
4. 执行 Node 和浏览器测试。

不要破坏法规 ID、来源 ID、版本、哈希和历史映射。研究候选数据只有在通过验证并进入运行读取链后，才算网页已接入。
