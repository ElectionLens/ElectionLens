#!/usr/bin/env python3
from __future__ import annotations
import argparse,csv,difflib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; SOURCE=Path('/Users/p0s097d/Desktop/TN_Form20_CSVs'); RESULTS=ROOT/'public/data/elections/ac/TN/2026.json'; BOOTH_ROOT=ROOT/'public/data/booths/TN'
SPECIAL_MAX={'151':280,'152':317}
def norm(x):return re.sub(r'[^A-Z0-9]','',(x or '').upper())
def process(p,write=False):
 acno=re.match(r'^(\d+)-',p.name).group(1);aid=f'TN-{int(acno):03d}';ac=json.load(open(RESULTS))[aid];rows=list(csv.reader(open(p,encoding='utf-8-sig')));h=rows[0]
 vi=next(i for i,x in enumerate(h) if 'VALID' in x.upper());ri=next(i for i,x in enumerate(h) if 'REJECT' in x.upper());ti=next(i for i,x in enumerate(h) if x.upper() in ('TOTAL','TOTAL_VOTES'));ni=next((i for i,x in enumerate(h) if x.upper()=='NOTA'),None);start=3 if len(h)>2 and 'POLLING' in h[1].upper() and 'NAME' in h[2].upper() else (2 if h[1].upper().startswith('POLLING') else 1);headers=h[start:ni or vi];names=[c['name'] for c in ac['candidates']];used=set();mapping=[]
 for header in headers:
  k=norm(header);matches=[n for n in names if n not in used and (norm(n)==k or norm(n) in k or k in norm(n))]
  if not matches:
   matches=[n for n in names if n not in used]
   best=max(matches,key=lambda n:max(difflib.SequenceMatcher(None,k,norm(n)).ratio(),difflib.SequenceMatcher(None,norm(header[::-1]),norm(n)).ratio())) if matches else None
   if best and max(difflib.SequenceMatcher(None,k,norm(best)).ratio(),difflib.SequenceMatcher(None,norm(header[::-1]),norm(best)).ratio())>=.48:matches=[best]
  if len(matches)==1:mapping.append(matches[0]);used.add(matches[0])
  else:mapping.append(None)
 maxno=SPECIAL_MAX.get(acno,99999); parsed=[];sums={n:0 for n in names};nota_name=next((c['name'] for c in ac['candidates'] if c['party']=='NOTA'),None)
 for row in rows[1:]:
  if not row or not row[0].isdigit() or int(row[0])>maxno:continue
  try: vals=[int(row[start+i] or 0) for i in range(len(headers))];valid=int(row[vi] or 0);rej=int(row[ri] or 0);total=int(row[ti] or 0);nota=int(row[ni] or 0) if ni is not None else 0
  except: return {'status':'flagged','reason':f'bad row {row[0]}'}
  if sum(vals)!=valid or valid+rej+nota!=total:return {'status':'flagged','reason':f'checksum row {row[0]}'}
  parsed.append((int(row[0]),vals,valid,rej,total,nota))
 if any(x is None for x in mapping):
  return {'status':'flagged','reason':'unmatched headers','unmatched':[h for h,m in zip(headers,mapping) if m is None]}
 for _,vals,_,_,_,nota in parsed:
  for n,v in zip(mapping,vals):sums[n]+=v
  if nota_name:sums[nota_name]+=nota
 official={c['name']:c['votes'] for c in ac['candidates']};postal={n:official[n]-sums[n] for n in names}
 if any(v<0 for v in postal.values()):return {'status':'flagged','reason':'negative residual','rows':len(parsed)}
 if write:
  results={}
  for no,vals,valid,rej,total,nota in parsed:
   votes={n:0 for n in names}
   for n,v in zip(mapping,vals):votes[n]=v
   if nota_name:votes[nota_name]=nota
   results[f'{aid}-{no}']={'votes':[votes[n] for n in names],'total':total,'rejected':rej,'sourceNote':'corrected_archive_csv'}
  ranked=sorted(ac['candidates'],key=lambda c:c['votes'],reverse=True);out=BOOTH_ROOT/aid;out.mkdir(parents=True,exist_ok=True);doc={'acId':aid,'acName':ac['constituencyName'],'state':'Tamil Nadu','year':2026,'electionType':'assembly','totalBooths':len(results),'source':str(p),'candidates':[{'slNo':i+1,'name':c['name'],'party':c['party'],'symbol':''} for i,c in enumerate(ac['candidates'])],'results':results,'summary':{'totalVoters':ac['electors'],'totalVotes':ac['validVotes'],'turnoutPercent':ac['turnout'],'winner':{'name':ranked[0]['name'],'party':ranked[0]['party'],'votes':ranked[0]['votes']},'runnerUp':{'name':ranked[1]['name'],'party':ranked[1]['party'],'votes':ranked[1]['votes']},'margin':ranked[0]['votes']-ranked[1]['votes'],'marginPercent':round((ranked[0]['votes']-ranked[1]['votes'])/ac['validVotes']*100,2)},'postal':{'candidates':[{'name':n,'party':next(c['party'] for c in ac['candidates'] if c['name']==n),'postal':postal[n],'booth':sums[n],'total':official[n]} for n in names],'totalValid':sum(postal.values()),'rejected':0,'nota':postal.get(nota_name,0),'total':sum(postal.values()),'source':'official AC residual'},'dataQuality':{'tier':'verified','totalBooths':len(results),'form20ParsedBooths':len(results),'estimatedBooths':0,'missingBooths':0,'form20ParsedPct':100.0,'postalVotes':sum(postal.values()),'postalPct':round(sum(postal.values())/ac['validVotes']*100,2),'unmappedVotes':0,'unmappedPct':0,'acTotalsReconciled':True},'reconciledToElections':True,'sourceCsv':str(p)}; (out/'2026.json').write_text(json.dumps(doc,indent=2)+'\n')
 return {'status':'ok','rows':len(parsed),'postal':sum(postal.values())}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--write',action='store_true');args=ap.parse_args();s={}
 for p in sorted(SOURCE.glob('*.csv')):
  r=process(p,args.write);s[r['status']]=s.get(r['status'],0)+1;print(p.name,r)
 print(s)
if __name__=='__main__':main()
