"""Reproducible static integration; original handoffs remain untouched."""
from pathlib import Path
import json, shutil
ROOT=Path(__file__).resolve().parent
SRC=ROOT/'src/compliance'
RADAR=ROOT.parent/'PolicyRadar-team-handoff-GitHubPages'
DIST=ROOT/'dist'
DIST.mkdir(exist_ok=True)
for name in ['styles.css','i18n.js','favicon.svg','app.js']:
    shutil.copy2(SRC/'public'/name,DIST/name)
shutil.copy2(ROOT/'src/research.html',DIST/'research.html')
data={str(p.relative_to(SRC)).replace('\\','/'):json.loads(p.read_text(encoding='utf-8-sig')) for p in (SRC/'data').rglob('*.json')}
datajs=(SRC/'lib/data.js').read_text(encoding='utf-8-sig')
engine=(SRC/'lib/engine.js').read_text(encoding='utf-8-sig')
# Preserve the tested CommonJS implementation, with a read-only in-memory data adapter.
bundle='''(()=>{const files=FILES; const cache={}; const factories={
'node:fs':m=>m.exports={readFileSync:p=>JSON.stringify(files[p]),existsSync:()=>false},
'node:path':m=>m.exports={join:(...v)=>v.join('/').replace('lib/../','')},
'./data':(module,exports,require,__dirname)=>{DATAJS},
'./engine':(module,exports,require,__dirname)=>{ENGINE}
}; function req(id){if(id.startsWith('../data/'))return files[id.slice(3)];if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;factories[id](m,m.exports,req,'lib');return m.exports;}
const d=req('./data'), e=req('./engine');window.LocalCore={data:d,engine:e};
window.localApi=async function(path,options={}){const u=new URL(path,'https://local.invalid');let body=options.body?JSON.parse(options.body):{};
switch(u.pathname){case '/api/bootstrap':return d.bootstrap();case '/api/policies':return {items:d.searchPolicies(Object.fromEntries(u.searchParams))};
case '/api/evaluate':{const b=d.bootstrap();return e.evaluateScenario(body,{rules:d.table('法规条件与义务规则'),actions:d.table('合规行动清单'),materials:d.table('材料清单'),hsCandidates:d.table('HS候选与归类依据'),fields:d.table('产品参数与动态追问'),products:d.table('产品目录'),coverageProfiles:b.coverageModel.profiles,levelDefinitions:b.coverageModel.levelDefinitions});}
case '/api/calculate':return e.calculateTaxes(body);default:throw Error('未支持的本地功能');}};
})();'''.replace('FILES',json.dumps(data,ensure_ascii=False)).replace('DATAJS',datajs).replace('ENGINE',engine)
(DIST/'core.js').write_text(bundle,encoding='utf-8')
app=(DIST/'app.js').read_text(encoding='utf-8-sig')
start=app.index('async function api(');end=app.index('\nfunction showToast',start)
app=app[:start]+"async function api(path, options = {}) { return window.localApi(path, options); }\n"+app[end:]
app=app.replace("const STORAGE_KEY = 'small-appliance-compliance:v2'","const STORAGE_KEY = 'yuanjian-integrated:v1'")
app=app.replace('数据快照 2026-11-03','数据快照 2026-11-04')
(DIST/'app.js').write_text(app,encoding='utf-8')
html=(SRC/'public/index.html').read_text(encoding='utf-8-sig').replace('href="/','href="./').replace('src="/','src="./')
html=html.replace('远见 · 小家电出海合规工作台','远见 · 企业出海助手').replace('<small>小家电出海工作台</small>','<small>企业出海助手 · 小家电首期</small>')
html=html.replace('先看清法规要求，<br>再准备产品合规','让每一步出海，<br>都有依据可循')
html=html.replace('按目标市场和产品特征识别可能适用的法规、待办程序与材料，给出有依据的 HS 候选，并在数据充分时复算进口税费。','把企业档案、政策法规、新闻线索与税费测算连在一起，形成可追溯的行动建议。先补齐事实，再判断下一步。')
html=html.replace('<span>进口税费复算</span>','<span>进口税费复算</span><span>政策与舆情雷达</span><span>千问辅助建议</span>')
html=html.replace('      </nav>','''        <button class="nav-item" data-nav="radar" type="button"><span>07</span>政策与舆情雷达</button>
        <button class="nav-item" data-nav="companies" type="button"><span>08</span>企业研究档案</button>
        <button class="nav-item" data-nav="advice" type="button"><span>09</span>千问建议中心</button>
      </nav>''')
html=html.replace('    </main>',(ROOT/'panels.html').read_text(encoding='utf-8')+'\n    </main>')
html=html.replace('<label>产品名称','<label>企业名称<input data-key="company_name" maxlength="100" placeholder="填写企业名称"></label><label>产品名称')
html=html.replace('<script src="./app.js" defer></script>','<script src="./core.js" defer></script>\n  <script src="./app.js" defer></script>\n  <script src="./integration.js" defer></script>')
html=html.replace('</head>','<link rel="stylesheet" href="./integration.css">\n</head>')
(DIST/'index.html').write_text(html,encoding='utf-8')
for name in ['integration.js','integration.css']:
    shutil.copy2(ROOT/name,DIST/name)
if not (DIST/'news.json').exists():shutil.copy2(RADAR/'news.json',DIST/'news.json')
(DIST/'.nojekyll').touch()
print('Static site built:',DIST)
