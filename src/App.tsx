import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, CircleHelp, Database, FileSpreadsheet, Filter, Import, Layers3, Pencil, RotateCcw, Save, Search, UploadCloud, X } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { seedData } from './data';
import { loadData, saveData } from './storage';
import type { Override, Parameter, ResolvedParameter, Series } from './types';

const columns: { key: keyof Parameter; label: string }[] = [
  {key:'number',label:'パラメータNo.'},{key:'standardValue',label:'標準的な値'},{key:'unit',label:'単位'},
  {key:'name',label:'パラメータ名称'},{key:'detail',label:'設定値詳細'},{key:'unitCategory',label:'単位分類'},{key:'note',label:'備考'},
];

export function App() {
  const [data,setData]=useState<Series[]>(seedData); const [seriesId,setSeriesId]=useState('src350');
  const [modelId,setModelId]=useState('src350-m3'); const [query,setQuery]=useState(''); const [edit,setEdit]=useState(false);
  const [onlyDiff,setOnlyDiff]=useState(false); const [draft,setDraft]=useState<Series[]|null>(null);
  const [editScope,setEditScope]=useState<'model'|'series'>('model'); const [importOpen,setImportOpen]=useState(false);
  const [toast,setToast]=useState(''); const fileRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{loadData().then(saved=>saved&&setData(saved)).catch(()=>undefined)},[]);
  const source=edit&&draft?draft:data; const series=source.find(s=>s.id===seriesId)??source[0];
  const model=series.models.find(m=>m.id===modelId)??series.models[0];
  useEffect(()=>{if(!series.models.some(m=>m.id===modelId))setModelId(series.models[0].id)},[series,modelId]);
  const rows=useMemo(()=>series.parameters.map(p=>{
    const override=model.overrides[p.id]??{}; const changedFields=Object.keys(override).filter(k=>override[k as keyof Override]!==p[k as keyof Parameter]);
    return {...p,...override,override,changedFields} as ResolvedParameter;
  }).filter(p=>(!onlyDiff||p.changedFields.length>0)&&(!query||[p.number,p.name,p.detail,p.note].join(' ').toLowerCase().includes(query.toLowerCase()))),[series,model,query,onlyDiff]);

  const beginEdit=()=>{setDraft(structuredClone(data));setEdit(true)};
  const cancel=()=>{setDraft(null);setEdit(false);setToast('変更を破棄しました')};
  const persist=async()=>{if(!draft)return;setData(draft);await saveData(draft);setDraft(null);setEdit(false);setToast('変更を保存しました');setTimeout(()=>setToast(''),2500)};
  const update=(row:ResolvedParameter,key:keyof Parameter,value:string)=>setDraft(current=>{
    if(!current)return current; const next=structuredClone(current); const s=next.find(x=>x.id===seriesId)!;
    if(editScope==='series'){const p=s.parameters.find(x=>x.id===row.id)!;(p as unknown as Record<string,string>)[key]=value}
    else {const m=s.models.find(x=>x.id===modelId)!;m.overrides[row.id]??={};(m.overrides[row.id] as Record<string,string>)[key]=value}
    return next;
  });
  const resetOverride=(id:string)=>setDraft(current=>{if(!current)return current;const next=structuredClone(current);const m=next.find(s=>s.id===seriesId)!.models.find(x=>x.id===modelId)!;delete m.overrides[id];return next});

  async function importFile(file:File){
    let records:Record<string,unknown>[]=[];
    if(file.name.endsWith('.csv')) records=Papa.parse<Record<string,unknown>>(await file.text(),{header:true,skipEmptyLines:true}).data;
    else {const wb=XLSX.read(await file.arrayBuffer());records=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])}
    setImportOpen(false);setToast(`${file.name}：${records.length}件を読み込みました（プレビュー）`);setTimeout(()=>setToast(''),3500);
  }

  return <div className="app">
    <header><div className="brandmark"><Database size={22}/></div><div><h1>機械パラメータ管理</h1><p>Machine Parameter Database</p></div><div className="header-right"><span className="storage"><span/> ローカル保存</span><button className="help"><CircleHelp size={19}/></button></div></header>
    <main>
      <section className="control-card">
        <div className="selectors">
          <label>シリーズ<div className="select-wrap"><Layers3 size={17}/><select value={seriesId} onChange={e=>setSeriesId(e.target.value)}>{source.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown/></div></label>
          <label>型式<div className="select-wrap model"><select value={modelId} onChange={e=>setModelId(e.target.value)}>{series.models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><ChevronDown/></div></label>
          <label className="search-label">検索<div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="パラメータNo・名称・説明を検索"/>{query&&<button onClick={()=>setQuery('')}><X size={16}/></button>}</div></label>
          <div className="mode-block"><span>モード</span><button className={'mode '+(edit?'editing':'')} onClick={()=>edit?cancel():beginEdit()}><span className="toggle"><i/></span>{edit?<><Pencil/>編集モード</>:<><Check/>参照モード</>}</button></div>
        </div>
        <div className="context"><div><b>{series.name}</b><span>{series.description}</span><i>›</i><strong>{model.name}</strong></div><button onClick={()=>setImportOpen(true)}><Import size={17}/> Excel / CSV インポート</button></div>
      </section>

      {edit&&<section className="editbar"><div><Pencil/><span><b>編集モード</b><small>変更の適用先を選択してください</small></span><div className="scope"><button className={editScope==='series'?'active':''} onClick={()=>setEditScope('series')}>シリーズ共通値</button><button className={editScope==='model'?'active':''} onClick={()=>setEditScope('model')}>この型式だけ</button></div></div><div><button className="cancel" onClick={cancel}><X/>キャンセル</button><button className="save" onClick={persist}><Save/>変更を保存</button></div></section>}

      <section className="table-card">
        <div className="table-head"><div><h2>パラメータ一覧</h2><span>{rows.length} 件</span><em>{model.name}</em></div><div className="legend"><span><i className="common"/>共通値</span><span><i className="specific"/>型式固有値</span><button className={onlyDiff?'active':''} onClick={()=>setOnlyDiff(v=>!v)}><Filter/>この型式だけ違う値 <b>{Object.values(model.overrides).filter(x=>Object.keys(x).length).length}</b></button></div></div>
        <div className="table-scroll"><table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}{edit&&<th/>}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className={row.changedFields.length?'changed':''}>{columns.map(c=>{
          const changed=row.changedFields.includes(c.key); const editable=edit&&!['id','number'].includes(c.key);
          return <td key={c.key} className={`${c.key} ${changed?'cell-changed':''}`}>{c.key==='number'&&<span className="origin-dot"/>}{editable?<input value={String(row[c.key]??'')} onChange={e=>update(row,c.key,e.target.value)}/>:<>{String(row[c.key]??'')}{changed&&<small>型式固有</small>}</>}</td>})}{edit&&<td><button className="reset" title="共通値に戻す" disabled={!row.changedFields.length} onClick={()=>resetOverride(row.id)}><RotateCcw/></button></td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty">条件に一致するパラメータはありません</div>}</div>
        <footer><span>表示中：{rows.length} / {series.parameters.length} 件</span><span><i/> データはこのブラウザの IndexedDB に保存されます</span></footer>
      </section>
    </main>
    {importOpen&&<div className="modal-back" onMouseDown={()=>setImportOpen(false)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-x" onClick={()=>setImportOpen(false)}><X/></button><div className="modal-icon"><FileSpreadsheet/></div><h2>Excel / CSV インポート</h2><p>対象：<b>{series.name}</b> / <b>{model.name}</b></p><div className="import-scope"><label><input type="radio" name="import" defaultChecked/> シリーズ共通データ</label><label><input type="radio" name="import"/> 型式固有データ</label></div><div className="drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)importFile(f)}} onClick={()=>fileRef.current?.click()}><UploadCloud/><b>ファイルをドロップ</b><span>またはクリックして選択</span><small>.xlsx / .xls / .csv</small></div><input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>e.target.files?.[0]&&importFile(e.target.files[0])}/></div></div>}
    {toast&&<div className="toast"><Check/>{toast}</div>}
  </div>
}
