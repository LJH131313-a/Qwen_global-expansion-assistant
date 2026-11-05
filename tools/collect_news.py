"""Cloud/local snapshot collector. No database or third-party packages required."""
from pathlib import Path
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json, sys, re, os
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import radar_collector as radar

def normalize_date(value):
    try:return parsedate_to_datetime(value).isoformat()
    except (ValueError,TypeError):
        try:return datetime.fromisoformat(value.replace('Z','+00:00')).isoformat()
        except (ValueError,TypeError):return value

def update(fetcher=radar.fetch_feed, root=ROOT):
    target=root/'dist/news.json'
    old=json.loads(target.read_text(encoding='utf-8-sig')) if target.exists() else {'items':[]}
    feeds=json.loads((root/'tools/feeds.json').read_text(encoding='utf-8-sig'))
    items={x['url']:x for x in old['items'] if str(x.get('url','')).startswith(('https://','http://'))}
    errors=[];success=0;new=0
    for feed in feeds:
        try:
            rows=fetcher(feed);success+=1
            for row in rows:
                keys=['id','market','category','level','date','source','title','summary','impact','products','url','verified']
                n=dict(zip(keys,row));n.pop('id',None)
                if not str(n.get('url','')).startswith(('http://','https://')):continue
                n['date']=normalize_date(n['date'])
                for field in ['title','summary']:
                    n[field]=re.sub('<[^>]*>',' ',n[field]).strip()
                if n['url'] not in items:new+=1
                items[n['url']]=n
        except Exception as exc:errors.append({'source':feed['name'],'error':str(exc)[:240]})
    now=datetime.now(timezone.utc).isoformat()
    report={'attempted_at':now,'successful_sources':success,'total_sources':len(feeds),'new_items':new,'errors':errors}
    # A failed collection never overwrites the last good snapshot or its export time.
    (root/'dist/collection-status.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    if not success:raise RuntimeError('All sources failed; last successful news.json retained')
    def key(n):
        try:return datetime.fromisoformat(normalize_date(n['date']).replace('Z','+00:00')).timestamp()
        except (ValueError,TypeError):return 0
    ordered=sorted(items.values(),key=key,reverse=True)[:500]
    result={'items':ordered,'count':len(ordered),'exported_at':now,'collection':report}
    tmp=target.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');os.replace(tmp,target)
    print(f'Sources: {success}/{len(feeds)}; new items: {new}; snapshot: {len(ordered)}')
    return result

if __name__=='__main__':update()
