import unittest,json,tempfile,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from collect_news import update
class CollectorTests(unittest.TestCase):
 def test_failure_keeps_snapshot_and_partial_merges(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'dist').mkdir();(root/'tools').mkdir()
   old={'items':[{'url':'https://example.com/old','date':'2026-11-01'}],'exported_at':'2026-11-01'}
   target=root/'dist/news.json';target.write_text(json.dumps(old),encoding='utf-8')
   (root/'tools/feeds.json').write_text(json.dumps([{'name':'ok'},{'name':'bad'}]),encoding='utf-8')
   def fail(feed):raise ValueError('fixture unavailable')
   with self.assertRaises(RuntimeError):update(fail,root)
   self.assertEqual(json.loads(target.read_text()),old)
   def partial(feed):
    if feed['name']=='bad':raise ValueError('fixture unavailable')
    return [('1','德国','产品准入与安全','中','Thu, 05 Nov 2026 01:00:00 GMT','fixture','<b>Title</b>','Summary','Check','小家电','https://example.com/new','待核验')]
   result=update(partial,root);self.assertEqual(result['count'],2);self.assertEqual(result['items'][0]['title'],'Title');self.assertEqual(len(result['collection']['errors']),1)
   self.assertEqual(update(partial,root)['count'],2)
if __name__=='__main__':unittest.main()
