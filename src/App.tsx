import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, CircleHelp, Database, FileSpreadsheet, Filter, Import, Layers3, Pencil, RotateCcw, Save, Search, Trash2, UploadCloud, X } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { seedData } from './data';
import { loadData, saveData } from './storage';
import { applyImport, recordsToParameters } from './importer';
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
  const [importScope,setImportScope]=useState<'series'|'model'>('series');
  const [importing,setImporting]=useState(false); const [importError,setImportError]=useState('');
  const [deleteTarget,setDeleteTarget]=useState<ResolvedParameter|null>(null);

  useEffect(()=>{loadData().then(saved=>saved&&setData(saved)).catch(()=>undefined)},[]);
  const source=edit&&draft?draft:data; const series=source.find(s=>s.id===seriesId)??source[0];
  const model=series.models.find(m=>m.id===modelId)??series.models[0];
  useEffect(()=>{if(!series.models.some(m=>m.id===modelId))setModelId(series.models[0].id)},[series,modelId]);
  const rows=useMemo(()=>series.parameters.map(p=>{
    const override=model.overrides[p.id]??{}; const changedFields=Object.keys(override).filter(k=>override[k as keyof Override]!==p[k as keyof Parameter]);
    return {...p,...override,override,changedFields} as ResolvedParameter;
  }).filter(p=>(!onlyDiff||p.changedFields.length>0)&&(!query||[p.number,p.name,p.detail,p.note].join(' ').toLowerCase().includes(query.toLowerCase()))),[series,model,query,onlyDiff]);
  const unitCategoryOptions=useMemo(()=>{
    const values=new Set<string>();
    source.forEach(item=>{
      item.parameters.forEach(parameter=>{if(parameter.unitCategory.trim())values.add(parameter.unitCategory.trim())});
      item.models.forEach(variant=>Object.values(variant.overrides).forEach(override=>{if(override.unitCategory?.trim())values.add(override.unitCategory.trim())}));
    });
    return [...values].sort((a,b)=>a.localeCompare(b,'ja'));
  },[source]);

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
  const deleteRow=()=>{
    if(!deleteTarget)return;
    const deleted=deleteTarget;
    setDraft(current=>{if(!current)return current;const next=structuredClone(current);const target=next.find(s=>s.id===seriesId)!;target.parameters=target.parameters.filter(parameter=>parameter.id!==deleted.id);target.models.forEach(variant=>delete variant.overrides[deleted.id]);return next});
    setDeleteTarget(null);setToast(`パラメータNo. ${deleted.number} を削除しました（保存前）`);setTimeout(()=>setToast(''),3000);
  };

  async function importFile(file:File){
    setImporting(true);setImportError('');
    try {
      let records:Record<string,unknown>[]=[];
      if(file.name.toLowerCase().endsWith('.csv')){const parsed=Papa.parse<Record<string,unknown>>(await file.text(),{header:true,skipEmptyLines:true});if(parsed.errors.length)throw new Error(parsed.errors[0].message);records=parsed.data}
      else {const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});if(!wb.SheetNames.length)throw new Error('ワークシートがありません。');records=XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]],{defval:'',raw:false})}
      const converted=recordsToParameters(records);if(!converted.parameters.length)throw new Error('「パラメータNo」列を持つデータ行が見つかりません。1行目の見出しを確認してください。');
      const next=structuredClone(data);const index=next.findIndex(item=>item.id===seriesId);next[index]=applyImport(next[index],modelId,converted.parameters,importScope);
      setData(next);await saveData(next);setDraft(null);setEdit(false);setImportOpen(false);
      const notes=[`${converted.parameters.length}件を登録しました`];if(converted.skippedRows)notes.push(`空行${converted.skippedRows}件を除外`);if(converted.unknownColumns.length)notes.push(`追加列${converted.unknownColumns.length}件も保持`);
      setToast(`${file.name}：${notes.join('・')}`);setTimeout(()=>setToast(''),5000);
    }catch(error){setImportError(error instanceof Error?error.message:'ファイルを読み込めませんでした。')}finally{setImporting(false)}
  }

  return <div className={`app ${edit?'is-editing':''}`}>
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

      {edit&&<section className="editbar" role="status" aria-label="編集モード"><div><Pencil/><span><b>編集中：{editScope==='series'?'シリーズ共通値':'この型式だけ'}</b><small>黄色の入力欄は変更できます</small></span><div className="scope"><button className={editScope==='series'?'active':''} onClick={()=>setEditScope('series')}>シリーズ共通値</button><button className={editScope==='model'?'active':''} onClick={()=>setEditScope('model')}>この型式だけ</button></div></div><div><button className="cancel" onClick={cancel}><X/>キャンセル</button><button className="save" onClick={persist}><Save/>変更を保存</button></div></section>}

      <section className="table-card">
        <div className="table-head"><div><h2>パラメータ一覧</h2><span>{rows.length} 件</span><em>{model.name}</em></div><div className="legend"><span><i className="common"/>共通値</span><span><i className="specific"/>型式固有値</span><button className={onlyDiff?'active':''} onClick={()=>setOnlyDiff(v=>!v)}><Filter/>この型式だけ違う値 <b>{Object.values(model.overrides).filter(x=>Object.keys(x).length).length}</b></button></div></div>
        <div className="table-scroll">{edit&&<datalist id="unit-category-options">{unitCategoryOptions.map(value=><option key={value} value={value}/>)}</datalist>}<table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}{edit&&<th/>}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className={row.changedFields.length?'changed':''}>{columns.map(c=>{
          const changed=row.changedFields.includes(c.key); const editable=edit&&!['id','number'].includes(c.key);
          return <td key={c.key} className={`${c.key} ${changed?'cell-changed':''}`}>{c.key==='number'&&<span className="origin-dot"/>}{editable?(c.key==='detail'?<textarea value={row.detail} rows={5} placeholder="設定値の詳細を入力（Enterで改行）" onChange={e=>update(row,c.key,e.target.value)}/>:<input value={String(row[c.key]??'')} list={c.key==='unitCategory'?'unit-category-options':undefined} placeholder={c.key==='unitCategory'?'選択または新規入力':undefined} title={c.key==='unitCategory'?'過去の入力から選択、または新しい分類を入力できます':undefined} onChange={e=>update(row,c.key,e.target.value)}/>):<><span className={c.key==='detail'?'multiline-value':undefined}>{String(row[c.key]??'')}</span>{changed&&<small>型式固有</small>}</>}</td>})}{edit&&<td className="row-actions"><button className="reset" title="共通値に戻す" disabled={!row.changedFields.length} onClick={()=>resetOverride(row.id)}><RotateCcw/></button><button className="delete-row" title="この行を削除" aria-label={`パラメータNo. ${row.number}を削除`} onClick={()=>setDeleteTarget(row)}><Trash2/></button></td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty">条件に一致するパラメータはありません</div>}</div>
        <footer><span>表示中：{rows.length} / {series.parameters.length} 件</span><span><i/> データはこのブラウザの IndexedDB に保存されます</span></footer>
      </section>
    </main>
    {importOpen&&<div className="modal-back" onMouseDown={()=>!importing&&setImportOpen(false)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-x" disabled={importing} onClick={()=>setImportOpen(false)}><X/></button><div className="modal-icon"><FileSpreadsheet/></div><h2>Excel / CSV インポート</h2><p>対象：<b>{series.name}</b> / <b>{model.name}</b></p><div className="import-scope"><label><input type="radio" name="import" checked={importScope==='series'} onChange={()=>setImportScope('series')}/> シリーズ共通データ</label><label><input type="radio" name="import" checked={importScope==='model'} onChange={()=>setImportScope('model')}/> 型式固有データ</label></div>{importError&&<div className="import-error">{importError}</div>}<div className={`drop ${importing?'loading':''}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f&&!importing)importFile(f)}} onClick={()=>!importing&&fileRef.current?.click()}><UploadCloud/><b>{importing?'読み込み・登録中…':'ファイルをドロップ'}</b><span>またはクリックして選択</span><small>.xlsx / .xls / .csv（先頭シートを読み込み）</small></div><input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>{const file=e.target.files?.[0];if(file)importFile(file);e.target.value=''}}/></div></div>}
    {toast&&<div className="toast"><Check/>{toast}</div>}
    {deleteTarget&&<div className="modal-back confirm-back" role="presentation" onMouseDown={()=>setDeleteTarget(null)}><div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" onMouseDown={event=>event.stopPropagation()}><div className="confirm-icon"><AlertTriangle/></div><h2 id="delete-title">この行を削除しますか？</h2><p><b>パラメータNo. {deleteTarget.number}</b>{deleteTarget.name&&deleteTarget.name!=='-'?`「${deleteTarget.name}」`:''}を削除します。</p><div className="delete-warning">シリーズ共通の行と、すべての型式固有値が削除対象になります。変更を保存するまではキャンセルできます。</div><div className="confirm-actions"><button onClick={()=>setDeleteTarget(null)}>削除しない</button><button className="confirm-delete" onClick={deleteRow}><Trash2/>行を削除</button></div></div></div>}
  </div>
}
