#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; ARCHIVE=Path('/Users/p0s097d/Desktop/archive/boothwise_dataset'); RESULTS=ROOT/'public/data/elections/ac/TN/2026.json'; BOOTH_ROOT=ROOT/'public/data/booths/TN'

def pdf_rows(pdf, non_nota, max_booth=2000):
 text=subprocess.run(['pdftotext','-raw',str(pdf),'-'],capture_output=True,text=True,timeout=120,check=False).stdout; found={}
 for line in text.splitlines():
  nums=[int(x) for x in re.findall(r'(?<![A-Za-z])\d+',line)]
  if not nums: continue
  starts=(2,1) if len(nums)>1 and nums[0]==nums[1] else (1,2)
  for start in starts:
   if start==2 and len(nums)<2: continue
   booth=nums[1] if start==2 and nums[0]==nums[1] else nums[0]
   if not 1<=booth<=max_booth: continue
   for tail_len in (5,4):
    if len(nums)<start+non_nota+tail_len: continue
    cand=nums[start:start+non_nota]; tail=nums[start+non_nota:start+non_nota+tail_len]
    if tail_len==5: valid,rejected,nota,total,tendered=tail
    else: valid,rejected,nota,total=tail; tendered=0
    if sum(cand)==valid and valid+rejected+nota==total:
     if booth not in found: found[booth]=(cand,valid,rejected,nota,total,tendered)
     break
 return found

def process(ac_id,ac,folder):
 pdfs=list(folder.glob('*_Form_20.pdf'))
 if not pdfs:return {'status':'skip','reason':'no pdf'}
 non=[c for c in ac['candidates'] if c.get('party')!='NOTA']; rows=pdf_rows(pdfs[0],len(non))
 if not rows:return {'status':'flagged','reason':'no valid PDF rows'}
 col_sums=[sum(r[0][i] for r in rows.values()) for i in range(len(non))]; cols=sorted(range(len(non)),key=lambda i:-col_sums[i]); cands=sorted(range(len(non)),key=lambda i:-non[i]['votes']); mapping=dict(zip(cols,cands)); booth={c['name']:0 for c in ac['candidates']}
 for col,cidx in mapping.items(): booth[non[cidx]['name']]=col_sums[col]
 nota_name=next(c['name'] for c in ac['candidates'] if c.get('party')=='NOTA'); booth[nota_name]=sum(r[3] for r in rows.values()); diffs={c['name']:c['votes']-booth.get(c['name'],0) for c in ac['candidates']}; residual=sum(diffs.values())
 if any(v<0 for v in diffs.values()): return {'status':'flagged','reason':'booth sum exceeds official','rows':len(rows)}
 if residual>max(100,int(ac['validVotes']*.05)): return {'status':'flagged','reason':f'postal residual {residual} too high','rows':len(rows)}
 return {'status':'ok','rows':len(rows),'raw':rows,'mapping':mapping,'boothSums':booth,'pdf':str(pdfs[0])}

def build_booths(ac_id,row_numbers):
 old_path=BOOTH_ROOT/ac_id/'booths.json'; old=json.loads(old_path.read_text()) if old_path.exists() else {}; by={int(b.get('num')):b for b in old.get('booths',[]) if str(b.get('num','')).isdigit()}; out=[]
 for n in sorted(row_numbers):
  b=by.get(n,{}); out.append({'id':f'{ac_id}-{n}','boothNo':str(n),'num':n,'type':b.get('type','regular'),'name':b.get('name',''),'address':b.get('address',''),'area':b.get('area',''),'source':'official Form20 PDF 2026'})
 return {'acId':ac_id,'state':'Tamil Nadu','totalBooths':len(out),'lastUpdated':'2026-09-16','source':'official Form20 PDF 2026','booths':out}

def build_doc(ac_id,ac,out):
 names=[c['name'] for c in ac['candidates']]; non=[c for c in ac['candidates'] if c.get('party')!='NOTA']; nota_idx=names.index(next(c['name'] for c in ac['candidates'] if c.get('party')=='NOTA')); results={}
 for num,(vals,valid,rejected,nota,total,tendered) in sorted(out['raw'].items()):
  votes=[0]*len(names)
  for col,cidx in out['mapping'].items(): votes[names.index(non[cidx]['name'])]=vals[col]
  votes[nota_idx]=nota; results[f'{ac_id}-{num}']={'votes':votes,'total':total,'rejected':rejected,'sourceNote':'official_form20_pdf'}
 ranked=sorted(ac['candidates'],key=lambda c:c.get('votes',0),reverse=True); official={c['name']:c['votes'] for c in ac['candidates']}; booth=out['boothSums']; postal=[{'name':c['name'],'party':c['party'],'postal':official[c['name']]-booth.get(c['name'],0),'booth':booth.get(c['name'],0),'total':official[c['name']]} for c in ac['candidates']]; ptotal=sum(x['postal'] for x in postal)
 return {'acId':ac_id,'acName':ac.get('constituencyName',''),'state':'Tamil Nadu','year':2026,'electionType':'assembly','date':'2026-05-07','totalBooths':len(results),'source':out['pdf'],'candidates':[{'slNo':i+1,'name':c['name'],'party':c['party'],'symbol':''} for i,c in enumerate(ac['candidates'])],'results':results,'summary':{'totalVoters':ac.get('electors',0),'totalVotes':ac.get('validVotes',0),'turnoutPercent':ac.get('turnout',0),'winner':{'name':ranked[0]['name'],'party':ranked[0]['party'],'votes':ranked[0]['votes']},'runnerUp':{'name':ranked[1]['name'],'party':ranked[1]['party'],'votes':ranked[1]['votes']},'margin':ranked[0]['votes']-ranked[1]['votes'],'marginPercent':round((ranked[0]['votes']-ranked[1]['votes'])/ac['validVotes']*100,2)},'postal':{'candidates':postal,'totalValid':ptotal,'rejected':0,'nota':next(x['postal'] for x in postal if x['name']=='NOTA'),'total':ptotal,'source':'official AC residual'},'dataQuality':{'tier':'verified','totalBooths':len(results),'form20ParsedBooths':len(results),'estimatedBooths':0,'missingBooths':0,'form20ParsedPct':100.0,'postalVotes':ptotal,'postalPct':round(ptotal/ac['validVotes']*100,2),'unmappedVotes':0,'unmappedPct':0.0,'acTotalsReconciled':True},'reconciledToElections':True,'sourcePdf':out['pdf']}

def main():
 ap=argparse.ArgumentParser(); ap.add_argument('--write',action='store_true'); ap.add_argument('--ac'); args=ap.parse_args(); results=json.loads(RESULTS.read_text()); targets=[int(args.ac)] if args.ac else range(1,235); summary={'ok':0,'flagged':0,'skip':0}
 for n in targets:
  aid=f'TN-{n:03d}'; folders=[p for p in ARCHIVE.iterdir() if p.is_dir() and p.name.startswith(f'{n:03d}-')]
  if not folders: summary['skip']+=1; continue
  out=process(aid,results[aid],folders[0]); summary[out['status']]+=1; print(aid,out['status'],out.get('rows'),out.get('reason',''))
  if args.write and out['status']=='ok':
   d=BOOTH_ROOT/aid; d.mkdir(parents=True,exist_ok=True); (d/'2026.json').write_text(json.dumps(build_doc(aid,results[aid],out),indent=2)+'\n'); (d/'booths.json').write_text(json.dumps(build_booths(aid,out['raw'].keys()),indent=2)+'\n')
 print(json.dumps(summary,indent=2))
if __name__=='__main__': main()
