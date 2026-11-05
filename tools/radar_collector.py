# Minimal local news collector API. Configure only feeds you have permission to access.
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from pathlib import Path
from datetime import datetime, timezone
import json, sqlite3, urllib.request, xml.etree.ElementTree as ET, re, os, shutil

ROOT=Path(__file__).resolve().parent
DB=Path(os.environ.get('POLICY_RADAR_DB', str(ROOT/'news.sqlite3')))
LOCAL_DB=ROOT/'news.sqlite3'
FEEDS=ROOT/'feeds.json'
CATEGORIES=['产品准入与安全','能效与生态设计','环保与材料限制','标签与消费者信息','贸易与海关','召回与执法','政策利好与市场机会','平台与销售规则','市场风向与行业热点']
KEYWORDS={
'产品准入与安全':['安全','认证','合格评定','标准','测试','market access','certification','safety','approval'],
'能效与生态设计':['能效','能源效率','待机','生态设计','节能','energy efficiency','ecodesign','standby'],
'环保与材料限制':['环保','有害物质','电池','包装','回收','化学品','waste','recycling','substance','battery'],
'标签与消费者信息':['标签','说明书','警示','原产地','消费者信息','label','labelling','warning'],
'贸易与海关':['关税','海关','进口','反倾销','原产地规则','清关','tariff','customs','import'],
'召回与执法':['召回','抽检','罚款','禁售','执法','recall','enforcement','fine'],
'政策利好与市场机会':['补贴','消费刺激','投资','绿色产品','资助','subsidy','incentive','investment'],
'平台与销售规则':['电商','平台','广告','产品责任','线上销售','e-commerce','online marketplace','consumer protection'],'市场风向与行业热点':['consumer demand','retail sales','home improvement','market trend','industry outlook','appliance market','appliance sales','smart home','home electronics','green consumption','energy saving','air quality','consumer electronics','家电市场','消费趋势','消费需求','零售销售','产业趋势','行业动态','智能家居','绿色消费','空气质量']}

def db_init():
 with sqlite3.connect(DB) as c:c.execute('''CREATE TABLE IF NOT EXISTS news(id TEXT PRIMARY KEY, market TEXT, category TEXT, level TEXT, date TEXT, source TEXT, title TEXT, summary TEXT, impact TEXT, products TEXT, url TEXT, verified TEXT)''')
def categorize(text):
 low=text.lower()
 for cat,words in KEYWORDS.items():
  if any(w.lower() in low for w in words): return cat
 return None
def gettext(el, names):
 for n in names:
  v=el.findtext(n)
  if v:return v.strip()
 return ''
def relevant_news(text):
 t=text.lower()
 terms=['appliance','home appliance','household electrical','kitchen appliance','vacuum','air purifier','hair dryer','washing machine','energy efficiency','ecodesign','product safety','certification','technical standard','product standard','product recall','tariff','customs','import duty','import regulation','export control','origin rule','packaging','labelling','labeling','battery','hazardous substance','chemical restriction','recycling','e-commerce regulation','consumer product','supply chain','consumer demand','retail sales','home improvement','smart home','home electronics','consumer electronics','appliance sales','green consumption','energy saving','air quality','trade measure','market access','appliance market','家电','小家电','消费需求','零售销售','消费趋势']
 return any(x in t for x in terms)
def impact_hint(category, market):
 hints={
 '产品准入与安全':'核对涉及产品是否落入当地强制认证/测试范围，检查证书持有人、测试标准及生效日期；出货前确认型号和技术文件。',
 '能效与生态设计':'对照该市场适用的能效门槛、测试方法、待机功耗与标签要求，确认在售型号是否需要改版或补测。',
 '环保与材料限制':'核对材料、化学物质、电池与包装的适用范围；检查供应商声明、回收注册及费用，并确认过渡期。',
 '标签与消费者信息':'检查当地语言、警示、原产地、说明书和电商商品页要求，列出需要改版的包装与线上资料。',
 '贸易与海关':'复核 HS 编码、关税/贸易救济、原产地规则、进口许可和清关文件，更新到岸成本及供应链方案。',
 '召回与执法':'核对通报涉及的型号、批次和销售渠道，检查本企业是否有同类风险，并准备停售、追溯与整改流程。',
 '平台与销售规则':'检查目标平台的上架资料、责任主体、广告声明、退换货与售后要求，更新商品页和运营流程。',
 '政策利好与市场机会':'确认政策面向的行业、地区、企业资格、支持方式和申请期限，再评估小家电项目能否申报或合作。',
 '市场风向与行业热点':'把报道当作需求线索：核对目标市场的销量、搜索、渠道数据与价格带，比较竞品后再调整选品、库存或营销，不凭单条新闻直接扩产。'}
 return f'{market}关注建议：'+hints.get(category,'打开原文核对适用市场、产品范围和时间节点，再评估对选品、成本或渠道的影响。')
def fetch_feed(feed):
 req=urllib.request.Request(feed['url'],headers={'User-Agent':'PolicyRadarDemo/1.0 (contact site owner before production use)'})
 with urllib.request.urlopen(req,timeout=20) as r: raw=r.read()
 root=ET.fromstring(raw); entries=root.findall('.//item') or root.findall('.//{http://www.w3.org/2005/Atom}entry'); out=[]
 for e in entries[:100]:
  title=gettext(e,['title','{http://www.w3.org/2005/Atom}title']); desc=gettext(e,['description','summary','{http://www.w3.org/2005/Atom}summary']); link=gettext(e,['link'])
  if not link:
   le=e.find('{http://www.w3.org/2005/Atom}link'); link=le.attrib.get('href','') if le is not None else ''
  pub=gettext(e,['pubDate','published','updated','{http://www.w3.org/2005/Atom}published'])[:25]
  text=title+' '+desc
  if not title or not link or not relevant_news(text):continue
  cat=categorize(text) or '市场风向与行业热点'
  key=re.sub(r'\W+','',title.lower())[:100] or link
  products=feed.get('products','小家电相关品类（按原文范围核实）')
  out.append((key,feed['market'],cat,'中',pub or datetime.now(timezone.utc).strftime('%Y-%m-%d'),feed['name'],title,desc[:800],impact_hint(cat,feed['market']),products,link,'待核验'))
 return out
def collect():
 cfg=json.loads(FEEDS.read_text(encoding='utf-8')) if FEEDS.exists() else []
 total=0; errors=[]
 with sqlite3.connect(DB) as c:
  for feed in cfg:
   try:
    rows=fetch_feed(feed); c.executemany('INSERT OR IGNORE INTO news VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',rows); total+=len(rows)
   except Exception as ex: errors.append({'source':feed.get('name','?'),'error':str(ex)[:240]})
 return {'inserted':total,'errors':errors,'updated_at':datetime.now(timezone.utc).isoformat()}
class Handler(BaseHTTPRequestHandler):
 def send(self,obj,code=200):
  b=json.dumps(obj,ensure_ascii=False).encode();self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Access-Control-Allow-Origin','*');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_GET(self):
  if self.path in ('/','/policy-radar.html'):
   page=(ROOT/'policy-radar.html').read_bytes();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(page)));self.end_headers();self.wfile.write(page);return
  if self.path.startswith('/api/health'):return self.send({'ok':True,'database':str(DB.name)})
  if self.path.startswith('/api/news'):
   p=parse_qs(urlparse(self.path).query); sql='SELECT market,category,level,date,source,title,summary,impact,products,url,verified FROM news WHERE 1=1'; args=[]
   for k,col in [('market','market'),('category','category')]:
    if p.get(k):sql+=f' AND {col}=?';args.append(p[k][0])
   sql+=' ORDER BY date DESC LIMIT 5000'
   with sqlite3.connect(DB) as c:c.row_factory=sqlite3.Row; rows=[dict(x) for x in c.execute(sql,args)]
   rows=[x for x in rows if relevant_news(x.get('title','')+' '+x.get('summary',''))]
   return self.send({'items':rows,'count':len(rows)})
  return self.send({'error':'not found'},404)
 def do_POST(self):
  if self.path!='/api/refresh':return self.send({'error':'not found'},404)
  return self.send(collect())
def refresh_saved_tips():
 with sqlite3.connect(DB) as c:
  rows=c.execute('SELECT id, market, category FROM news').fetchall()
  for item in rows:
   c.execute('UPDATE news SET impact=? WHERE id=?',(impact_hint(item[2],item[1]),item[0]))
if __name__=='__main__':
 if DB != LOCAL_DB and not DB.exists() and LOCAL_DB.exists():
  DB.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(LOCAL_DB,DB)
 db_init();refresh_saved_tips();host=os.environ.get('HOST','127.0.0.1');port=int(os.environ.get('PORT','8765'));print(f'Policy Radar API: http://{host}:{port}');ThreadingHTTPServer((host,port),Handler).serve_forever()
