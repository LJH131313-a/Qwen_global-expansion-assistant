# 远见 · 企业出海助手（静态整合版）

## 先打开看效果

双击 `启动预览.bat`，打开 http://localhost:8090 。首次打不开时，等预览窗口显示服务已启动后刷新。需要本机安装 Python 3.12；预览窗口保持开启。不要直接双击 HTML，浏览器通常会限制读取新闻文件。

## 已集成什么

| 模块 | 内容与实际能力 |
| --- | --- |
| 企业研究 | 小熊电器、石头科技两家档案；一键带入研究情景；保留完整前置研究 |
| 产品情景 | 57 个小类、动态字段、市场、经营角色与产品地区版信息 |
| 法规与合规 | 79 条法规索引、245 个来源、86 条规则；适用、待补事实、待规则核验分别显示 |
| HS 与税费 | 保留队友原始确定性引擎；仅在已有画像的市场与产品组合复算，未知不按零处理 |
| 政策与舆情雷达 | 读取新闻 JSON，按市场、主题、关键词和项目筛选；选定新闻进入建议与报告 |
| 千问建议 | 生成带来源的分析任务 → 人工粘贴到千问办公 → 回复粘贴回网站 → 保存到报告 |
| 报告 | 合规、行动材料、税费、新闻与千问建议统一打印；项目 JSON 包含建议和所选新闻 |

政策与税费在浏览器内运行，不需要 Node 后台。原始交付目录没有被修改。本项目的 `src/compliance` 保留相关原始源码及 JSON；不包含一千兆压缩包、数据库、研究缓存和大量 PDF，法规通过官方来源链接访问。

## 免费发布到 GitHub Pages

1. 新建一个用于团队展示的**公开仓库**，默认分支使用 `main`。
2. 把本文件夹内的内容放到仓库根目录。尤其是 `.github/workflows/publish.yml` 必须保留；不要把整个“出海助手”目录再套在仓库下面。推荐使用 GitHub Desktop 的“Add local repository / Publish repository”流程，并检查 `.github` 是否上传。
3. 仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。本项目不使用 “Deploy from a branch”。
4. **Settings → Actions → General → Workflow permissions** 允许工作流读写仓库。如果组织政策或受保护分支禁止机器人提交，需要由管理员允许，或改为人工提交快照。
5. 在 **Actions → Refresh news and publish Pages → Run workflow** 运行一次，等待 Deploy 步骤成功。发布链接在 Pages 设置和工作流页面。
6. 后续提交、定时任务和手动 Run workflow 都会先采集再发布。默认北京时间每天约 09:17、17:17。采集机器人保存快照不会递归触发新工作流；GitHub 调度可能延迟，不能作为分钟级实时服务。

上传到 GitHub 后无需在云端运行 build.py，`dist` 已经是构建好的完整静态网站。工作流会直接发布 `dist`，所以项目子路径也能正常加载。

### 为什么电脑关机也能更新

GitHub 的标准 Linux 执行环境运行 Python → 读取允许访问的 RSS/Atom → 合并历史 `news.json` → 写入来源健康状态 → 保存快照到仓库 → 同一个工作流发布 Pages。采集不依赖本地 SQLite，也不依赖队友电脑。

公开仓库的标准 GitHub-hosted runner 当前免费，Pages 对 GitHub Free 的公开仓库可用。公共仓库连续 60 天无活动时定时工作流可能被停用；遇到停用，在 Actions 中重新启用。仓库或组织的权限和平台规则可能影响可用性。

### 采集失败怎么办

部分来源失败时合并成功来源，保留历史新闻，并在页面显示失败数。全部失败时保留最后成功的 news.json 及其时间，单独更新 collection-status.json。工作流仍会发布可用快照，并在运行摘要报告失败。页面有导出时间和 48 小时过期提示，但“最近导出”不代表每条新闻最近发布或已核验。

也可以双击 `更新新闻.bat` 本地采集，再把 `dist/news.json` 和 `dist/collection-status.json` 提交到仓库。若队友继续使用原包里的 export-news.bat，将导出的 news.json 放到本项目的 dist 即可；其 count/items/exported_at 格式兼容。

## 千问办公演示步骤

1. 在企业档案选择研究路线，补充实际出口款参数，运行合规初筛。
2. 到税费页复算；没有画像时保留阻断提示。要演示已支持的金额路径，可选新加坡电热水壶等现有组合，按真实交易填写。
3. 在雷达中选择最多 8 条相关新闻；或让系统取当前市场最近 5 条。
4. 到千问建议中心生成任务，复制到千问办公，运行分析。任务只选相关法规来源，避免混入整个资料库。
5. 把真实回复粘贴回页面，点击保存；综合报告会标注“用户从千问导入，尚待人工复核”。不要把自写的规则提示当作千问实际运行结果。
6. 打印综合报告或导出项目 JSON。项目变更后历史建议会提示需要重新分析。

建议、产品输入和办理进度保存在当前浏览器，不会自动同步给队友；应导出项目备份。手动把资料交给千问前，由使用者决定需要提供哪些企业信息。

## 当前需要继续补强的内容

- 小熊→马来西亚与石头→德国是研究案例。现有数据对这些组合可能仅提供 L1 资料导航；页面不会把研究文字自动提升成可执行规则。前置研究中的马来西亚半岛范围需要在具体规则入库时保持，不能泛化成全国。
- 雷达首期主要是政府政策与市场线索，尚无微博、社交平台、评论情感分析或全网舆情覆盖；关键词过滤会有噪声，不能直接驱动正式合规判断。
- 本次实测 11 个 RSS 来源中 9 个可连接；巴西旧地址返回 404，印度税务源返回 403。失败已记录，未绕过访问限制。来源可在 tools/feeds.json 维护。
- API 尚未接入；千问在人工步骤执行。比赛若要求自动 API 或特定核心 AI 流程，应按比赛原文另行核对；演示时保留真实千问分析记录。
- 规则核验日期沿用队友交付的 2026-11-04。这次是整合与运行验证，没有重新完成全部法规有效性、税率、证书真实性核验。
- GitHub Pages 用于团队作品展示。正式商业 SaaS 需要按平台条款选择正式托管方式。

## 后续维护

编辑 `src/compliance` 中的原始页面、数据和引擎，或者本项目的 panels.html、integration.js、integration.css，运行 `python build.py` 后提交 `dist`。构建保留已有新闻快照。新增法规则需同时补来源、条件、字段和案例，不能只在首页加一句支持。

验证命令：

```text
python build.py
node tests/static-parity.cjs
python tests/test_collect.py
```

### 团队分工对接

| 负责人 | 继续交付给主站的内容 |
| --- | --- |
| 主网站与产品 | 统一流程、页面、部署、数据版本与完整演示 |
| zky | 维护规则和税费画像；优先补德国机器人、马来西亚半岛电饭煲的可执行条件 |
| wjy | 维护允许采集的源、新闻相关性与核验；提供千问分析记录或后续接口契约 |
| yjh | 更新两家企业和出口款的证据、地区版及参数，不用国内型号默认替代出口款 |

### 官方依据（2026-11-05 查阅）

- [GitHub Actions 计费说明](https://docs.github.com/en/actions/concepts/billing-and-usage)
- [GitHub Pages 入门](https://docs.github.com/en/pages/getting-started-with-github-pages)
- [定时工作流与限制](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [使用工作流发布 Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Pages 使用限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
