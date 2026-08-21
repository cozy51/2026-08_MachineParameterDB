import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, ChevronDown, CircleHelp, CloudCog, Download, FileSpreadsheet, Filter, Import, Layers3, Pencil, RotateCcw, Save, Search, Sheet, Trash2, Upload, UploadCloud, X } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Brandmark } from './Brandmark';
import { seedData } from './data';
import { ensureEnvelope, getDeviceId, loadData, saveData, writeEnvelope } from './storage';
import { clearCloudSettings, compareBackups, currentUser, downloadBackup, loadCloudSettings, safeUpload, saveCloudSettings, signIn, signOut, supabase, validateBackup, type CloudBackup, type SyncState } from './backup';
import { applyImport, recordsToParameters } from './importer';
import type { BackupEnvelope, Override, Parameter, ResolvedParameter, Series } from './types';

type Column = { key: keyof Parameter; label: string; multiline?: boolean };
const defaultColumns: Column[] = [
  {key:'number',label:'パラメータNo.'},{key:'standardValue',label:'標準的な値'},{key:'unit',label:'単位'},{key:'unitCategory',label:'単位分類'},
  {key:'name',label:'パラメータ名称'},{key:'detail',label:'設定値詳細',multiline:true},{key:'note',label:'備考'},
];
const hu300Columns: Column[] = [
  {key:'number',label:'パラメータNo.'},{key:'min',label:'最小'},{key:'max',label:'最大'},{key:'unit',label:'単位'},{key:'unitCategory',label:'単位分類'},
  {key:'display',label:'表示内容',multiline:true},{key:'note',label:'備考'},
];
const columnsBySeries: Record<string,Column[]> = {hu300:hu300Columns};
const searchKeysBySeries: Record<string,(keyof Parameter)[]> = {hu300:['number','display','note']};
const defaultSearchKeys: (keyof Parameter)[] = ['number','name','detail','note'];
function highlightMatches(text:string,query:string){
  const q=query.trim(); if(!q)return text;
  const parts=text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'gi'));
  if(parts.length===1)return text;
  return parts.map((part,i)=>part.toLowerCase()===q.toLowerCase()?<mark key={i} className="search-hit">{part}</mark>:part);
}

export function App() {
  const [data,setData]=useState<Series[]>(seedData); const [seriesId,setSeriesId]=useState('src350');
  const [modelId,setModelId]=useState('src350-m2'); const [cargoTypeId,setCargoTypeId]=useState('foup'); const [parameterNumber,setParameterNumber]=useState(''); const [unitCategoryFilter,setUnitCategoryFilter]=useState(''); const [query,setQuery]=useState(''); const [edit,setEdit]=useState(false);
  const [onlyDiff,setOnlyDiff]=useState(false); const [draft,setDraft]=useState<Series[]|null>(null);
  const [editScope,setEditScope]=useState<'cargo'|'model'|'series'>('model'); const [importOpen,setImportOpen]=useState(false);
  const [toast,setToast]=useState(''); const fileRef=useRef<HTMLInputElement>(null);
  const localImportRef=useRef<HTMLInputElement>(null);
  const [importScope,setImportScope]=useState<'series'|'model'>('series');
  const [importing,setImporting]=useState(false); const [importError,setImportError]=useState('');
  const [deleteTarget,setDeleteTarget]=useState<ResolvedParameter|null>(null);
  const [envelope,setEnvelope]=useState<BackupEnvelope|null>(null);const [userId,setUserId]=useState('');
  const [syncState,setSyncState]=useState<SyncState>(supabase?'local':'disabled');const [lastSync,setLastSync]=useState('');
  const [cloudBackup,setCloudBackup]=useState<CloudBackup|null>(null);const [authOpen,setAuthOpen]=useState(false);const [conflictOpen,setConflictOpen]=useState(false);const [forceConfirmOpen,setForceConfirmOpen]=useState(false);
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [cloudError,setCloudError]=useState('');
  const initialCloudSettings=loadCloudSettings();const [supabaseUrl,setSupabaseUrl]=useState(initialCloudSettings?.url??'');const [supabaseAnonKey,setSupabaseAnonKey]=useState(initialCloudSettings?.anonKey??'');const [cloudConfigured,setCloudConfigured]=useState(Boolean(initialCloudSettings));

  useEffect(()=>{loadData().then(async saved=>{const series=saved??seedData;setData(series);setEnvelope(await ensureEnvelope(series))}).catch(()=>undefined)},[]);
  useEffect(()=>{
    if(!toast)return;
    const timer=window.setTimeout(()=>setToast(''),4000);
    return ()=>window.clearTimeout(timer);
  },[toast]);
  useEffect(()=>{if(!supabase)return;currentUser().then(user=>{if(user)setUserId(user.id)});return supabase.auth.onAuthStateChange((_event,session)=>setUserId(session?.user.id??'')).data.subscription.unsubscribe},[]);
  const source=edit&&draft?draft:data; const series=source.find(s=>s.id===seriesId)??source[0];
  const model=series.models.find(m=>m.id===modelId)??series.models[0];
  const isBaseModel=series.id==='hu300'&&model.id==='hu300-m3';
  const cargoType=model.cargoTypes.find(item=>item.id===cargoTypeId)??model.cargoTypes[0];
  const hasCargoOverrides=Object.values(cargoType.overrides).some(override=>Object.keys(override).length>0);
  const hasModelOverrides=!isBaseModel&&Object.values(model.overrides).some(override=>Object.keys(override).length>0);
  useEffect(()=>{if(!series.models.some(m=>m.id===modelId))setModelId(series.models[0].id)},[series,modelId]);
  useEffect(()=>{if(!model.cargoTypes.some(item=>item.id===cargoTypeId))setCargoTypeId(model.cargoTypes[0].id)},[model,cargoTypeId]);
  useEffect(()=>{if(isBaseModel&&editScope==='model')setEditScope('series')},[isBaseModel,editScope]);
  useEffect(()=>{if(isBaseModel&&importScope==='model')setImportScope('series')},[isBaseModel,importScope]);
  const resolvedRows=useMemo(()=>series.parameters.map(p=>{
    const modelOverride=isBaseModel?{}:model.overrides[p.id]??{};const cargoOverride=cargoType.overrides[p.id]??{};const override={...modelOverride,...cargoOverride}; const changedFields=Object.keys(override).filter(k=>override[k as keyof Override]!==p[k as keyof Parameter]);
    return {...p,...override,override,changedFields,cargoChangedFields:Object.keys(cargoOverride)} as ResolvedParameter;
  }),[series,model,cargoType,isBaseModel]);
  const filterUnitCategories=useMemo(()=>[...new Set(resolvedRows.map(row=>row.unitCategory.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja')),[resolvedRows]);
  const columns=columnsBySeries[series.id]??defaultColumns;
  const searchKeys=searchKeysBySeries[series.id]??defaultSearchKeys;
  const rows=useMemo(()=>resolvedRows.filter(p=>(!onlyDiff||p.changedFields.length>0)&&(!parameterNumber||p.number===parameterNumber)&&(!unitCategoryFilter||p.unitCategory===unitCategoryFilter)&&(!query||searchKeys.map(key=>p[key]??'').join(' ').toLowerCase().includes(query.toLowerCase()))),[resolvedRows,parameterNumber,unitCategoryFilter,query,onlyDiff,searchKeys]);
  const parameterNumbers=useMemo(()=>[...new Set(series.parameters.map(parameter=>parameter.number))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),[series.parameters]);
  useEffect(()=>{if(parameterNumber&&!parameterNumbers.includes(parameterNumber))setParameterNumber('')},[parameterNumber,parameterNumbers]);
  useEffect(()=>{if(unitCategoryFilter&&!filterUnitCategories.includes(unitCategoryFilter))setUnitCategoryFilter('')},[unitCategoryFilter,filterUnitCategories]);

  const beginEdit=()=>{setDraft(structuredClone(data));setEdit(true)};
  const cancel=()=>{setDraft(null);setEdit(false);setToast('変更を破棄しました')};
  const persist=async()=>{if(!draft)return;setData(draft);setEnvelope(await saveData(draft));setDraft(null);setEdit(false);setToast('変更を保存しました')};
  const update=(row:ResolvedParameter,key:keyof Parameter,value:string)=>setDraft(current=>{
    if(!current)return current; const next=structuredClone(current); const s=next.find(x=>x.id===seriesId)!;
    if(editScope==='series'){const p=s.parameters.find(x=>x.id===row.id)!;(p as unknown as Record<string,string>)[key]=value}
    else if(editScope==='model'&&!isBaseModel){const m=s.models.find(x=>x.id===modelId)!;m.overrides[row.id]??={};(m.overrides[row.id] as Record<string,string>)[key]=value}
    else {const cargo=s.models.find(x=>x.id===modelId)!.cargoTypes.find(x=>x.id===cargoTypeId)!;cargo.overrides[row.id]??={};(cargo.overrides[row.id] as Record<string,string>)[key]=value}
    return next;
  });
  const handleFieldInput=(row:ResolvedParameter,key:keyof Parameter)=>(event:FormEvent<HTMLInputElement|HTMLTextAreaElement>)=>update(row,key,event.currentTarget.value);
  const resetOverride=(id:string)=>setDraft(current=>{if(!current)return current;const next=structuredClone(current);const m=next.find(s=>s.id===seriesId)!.models.find(x=>x.id===modelId)!;if(editScope==='cargo')delete m.cargoTypes.find(x=>x.id===cargoTypeId)!.overrides[id];else delete m.overrides[id];return next});
  const deleteRow=()=>{
    if(!deleteTarget)return;
    const deleted=deleteTarget;
    setDraft(current=>{if(!current)return current;const next=structuredClone(current);const target=next.find(s=>s.id===seriesId)!;target.parameters=target.parameters.filter(parameter=>parameter.id!==deleted.id);target.models.forEach(variant=>{delete variant.overrides[deleted.id];variant.cargoTypes.forEach(cargo=>delete cargo.overrides[deleted.id])});return next});
    setDeleteTarget(null);setToast(`パラメータNo. ${deleted.number} を削除しました（保存前）`);
  };

  async function importFile(file:File){
    setImporting(true);setImportError('');
    try {
      let records:Record<string,unknown>[]=[];
      if(file.name.toLowerCase().endsWith('.csv')){const parsed=Papa.parse<Record<string,unknown>>(await file.text(),{header:true,skipEmptyLines:true});if(parsed.errors.length)throw new Error(parsed.errors[0].message);records=parsed.data}
      else {const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});if(!wb.SheetNames.length)throw new Error('ワークシートがありません。');records=XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]],{defval:'',raw:false})}
      const converted=recordsToParameters(records);if(!converted.parameters.length)throw new Error('「パラメータNo」列を持つデータ行が見つかりません。1行目の見出しを確認してください。');
      const next=structuredClone(data);const index=next.findIndex(item=>item.id===seriesId);const result=applyImport(next[index],modelId,converted.parameters,importScope);next[index]=result.series;
      setData(next);setEnvelope(await saveData(next));setDraft(null);setEdit(false);setImportOpen(false);
      const notes=[`${result.added}件を追加しました`];if(result.skippedExisting)notes.push(`既存${result.skippedExisting}件はスキップ`);if(converted.skippedRows)notes.push(`空行${converted.skippedRows}件を除外`);if(converted.unknownColumns.length)notes.push(`追加列${converted.unknownColumns.length}件も保持`);
      setToast(`${file.name}：${notes.join('・')}`);
    }catch(error){setImportError(error instanceof Error?error.message:'ファイルを読み込めませんでした。')}finally{setImporting(false)}
  }

  function exportLocalBackup(){
    if(!envelope)return;
    const blob=new Blob([JSON.stringify(envelope,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');
    link.href=url;link.download=`MachineParameterDB-${new Date().toISOString().slice(0,10)}-v${envelope.dataVersion}.json`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);setToast('ローカルバックアップを書き出しました');
  }
  function exportParameterExcel(){
    const records=rows.map(row=>({...Object.fromEntries(columns.map(c=>[c.label.replace(/\.$/,''),row[c.key]??''])),...(row.extra??{})}));
    const sheet=XLSX.utils.json_to_sheet(records);sheet['!cols']=columns.map(c=>({wch:c.key==='number'?16:c.multiline?72:20}));const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'パラメータ一覧');
    XLSX.writeFile(book,`${series.name}-${model.name}-${cargoType.name}-parameters.xlsx`);setToast(`${rows.length}件をExcel出力しました`);
  }
  function downloadImportTemplate(){
    const headers=columns.map(c=>c.label.replace(/\.$/,''));
    const sample=columns.map(c=>c.key==='number'?'7001':c.key==='unitCategory'?'選択値':c.key==='note'?'任意':c.multiline?'複数行の説明も入力できます':c.key==='unit'?'—':'例');
    const sheet=XLSX.utils.aoa_to_sheet([headers,sample]);sheet['!cols']=columns.map(c=>({wch:c.key==='number'?16:c.multiline?60:20}));
    const guide=XLSX.utils.aoa_to_sheet([['インポート仕様'],['主キー','パラメータNo（対象シリーズ内で照合）'],['既存番号','登録済みのため変更せずスキップ（上書きしません）'],['新規番号','新しいパラメータとして追加'],['空白セル','新規行では空文字として登録'],['パラメータNoが空白の行','読み飛ばし'],['追加列','列名と値を追加項目として保持'],['対象シート','先頭シートのみ読み込み']]);guide['!cols']=[{wch:28},{wch:64}];
    const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'インポート用');XLSX.utils.book_append_sheet(book,guide,'入力ルール');XLSX.writeFile(book,`MachineParameterDB-${series.id}-import-template.xlsx`);setToast('インポート用Excelをダウンロードしました');
  }
  async function importLocalBackup(file:File){
    setCloudError('');
    try{
      const imported=validateBackup(JSON.parse(await file.text()));
      if(!window.confirm(`ローカルデータをバックアップ（世代 ${imported.dataVersion}）で置き換えますか？\n現在のデータは、復元に失敗した場合に元へ戻されます。`))return;
      const previous=envelope;
      try{await writeEnvelope(imported);setData(imported.data.series);setEnvelope(imported);setDraft(null);setEdit(false);setParameterNumber('');setSyncState(userId?'local-newer':supabase?'local':'disabled');setToast('ローカルバックアップを取り込みました')}
      catch(error){if(previous)await writeEnvelope(previous);throw error}
    }catch(error){setToast(`インポート失敗：${error instanceof Error?error.message:'JSONを確認してください'}`)}
  }

  async function checkCloud(){if(!userId||!envelope)return;setSyncState('checking');setCloudError('');try{const cloud=await downloadBackup(userId);setCloudBackup(cloud);if(!cloud){setSyncState('local-newer');return}const relation=await compareBackups(envelope,cloud.envelope);setSyncState(relation==='same'?'synced':relation);if(relation==='same')setLastSync(cloud.serverUpdatedAt??cloud.envelope.updatedAt)}catch(error){setSyncState('error');setCloudError(error instanceof Error?error.message:'クラウド確認に失敗しました')}}
  useEffect(()=>{if(userId&&envelope)checkCloud()},[userId,Boolean(envelope)]);
  async function uploadCloud(force=false){if(!userId||!envelope){setAuthOpen(true);return}setSyncState('uploading');setCloudError('');try{const result=await safeUpload(userId,envelope,force);if(!result.uploaded){setCloudBackup(result.cloud??null);setSyncState(result.relation);return}setSyncState('synced');setLastSync(result.skipped&&result.cloud?(result.cloud.serverUpdatedAt??result.cloud.envelope.updatedAt):new Date().toISOString());setToast(result.skipped?'クラウドと同期済みです（変更なし）':'クラウドへバックアップしました')}catch(error){setSyncState('error');setCloudError(error instanceof Error?error.message:'クラウド保存に失敗しました')}}
  useEffect(()=>{if(!userId||!envelope||syncState==='conflict'||syncState==='cloud-newer')return;const timer=window.setTimeout(()=>uploadCloud(),2000);return()=>clearTimeout(timer)},[envelope?.dataVersion,userId]);
  async function restoreCloud(){if(!userId)return;try{const cloud=cloudBackup??await downloadBackup(userId);if(!cloud)return;if(!window.confirm('クラウドデータでローカルを更新しますか？ 現在のローカルデータは安全に退避してから復元します。'))return;const old=envelope;try{await writeEnvelope(cloud.envelope);setData(cloud.envelope.data.series);setEnvelope(cloud.envelope);setSyncState('synced');setLastSync(cloud.serverUpdatedAt??cloud.envelope.updatedAt);setToast('クラウドから更新しました')}catch(error){if(old)await writeEnvelope(old);throw error}}catch(error){setSyncState('error');setCloudError(error instanceof Error?error.message:'復元に失敗しました')}}
  async function forceUploadCloud(){setForceConfirmOpen(false);setConflictOpen(false);await uploadCloud(true)}
  const localParameterCount=envelope?.data.series.reduce((total,item)=>total+item.parameters.length,0)??0;const cloudParameterCount=cloudBackup?.envelope.data.series.reduce((total,item)=>total+item.parameters.length,0)??0;const formatDate=(value?:string)=>value?new Date(value).toLocaleString('ja-JP'):'不明';
  const cloudUpdatedAt=cloudBackup?.serverUpdatedAt??cloudBackup?.envelope.updatedAt;
  const localUpdatedTime=Date.parse(envelope?.updatedAt??'');const cloudUpdatedTime=Date.parse(cloudUpdatedAt??'');
  const newerSide=!Number.isFinite(localUpdatedTime)||!Number.isFinite(cloudUpdatedTime)||localUpdatedTime===cloudUpdatedTime?'':localUpdatedTime>cloudUpdatedTime?'local':'cloud';
  const deviceLabel=(id?:string)=>!id?'不明':id===getDeviceId()?'このPC':`別の端末（${id.slice(0,8)}）`;
  async function login(){try{await signIn(email,password);const user=await currentUser();setUserId(user?.id??'');setAuthOpen(false);setPassword('')}catch(error){setCloudError(error instanceof Error?error.message:'ログインに失敗しました')}}
  function applyCloudSettings(){try{saveCloudSettings({url:supabaseUrl,anonKey:supabaseAnonKey});setCloudConfigured(true);setSyncState('local');setCloudError('');setToast('クラウド接続設定を保存しました')}catch(error){setCloudError(error instanceof Error?error.message:'設定を保存できませんでした')}}
  async function removeCloudSettings(){if(!window.confirm('このブラウザのSupabase接続設定を削除しますか？ IndexedDBのデータは削除されません。'))return;await signOut();clearCloudSettings();setCloudConfigured(false);setUserId('');setSyncState('disabled');setSupabaseUrl('');setSupabaseAnonKey('');setCloudError('')}
  const syncLabels:Record<SyncState,string>={disabled:'ローカル保存済み',local:'ローカル保存済み',checking:'クラウド確認中',synced:'クラウドと同期済み',uploading:'クラウド保存中','local-newer':'ローカルに新しい変更あり','cloud-newer':'クラウドに新しいデータあり',conflict:'同期競合',error:'クラウド保存失敗'};
  const syncLabel=syncLabels[syncState];

  return <div className={`app ${edit?`is-editing edit-scope-${editScope}`:''} ${hasCargoOverrides?'has-cargo-overrides':''}`}>
    <header><Brandmark/><div><h1>機械パラメータ管理</h1><p>Machine Parameter Database</p></div><div className="header-right"><div className={`sync-status sync-${syncState}`} title={cloudError||`データ世代: ${envelope?.dataVersion??0}`}><span/>{syncLabel}{lastSync&&<small>{new Date(lastSync).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</small>}</div>{userId?<button className="cloud-auth" onClick={()=>signOut()}>ログアウト</button>:<button className="cloud-auth" onClick={()=>setAuthOpen(true)}><CloudCog/>クラウド設定</button>}<button className="help"><CircleHelp size={19}/></button></div></header>
    <main>
      <section className="control-card">
        <div className="selectors has-parameter-filter">
          <label>シリーズ<div className="select-wrap"><Layers3 size={17}/><select value={seriesId} onChange={e=>setSeriesId(e.target.value)}>{source.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown/></div></label>
          <label>型式<div className={`select-wrap model ${hasModelOverrides?'has-model-overrides':''}`}><select value={modelId} onChange={e=>setModelId(e.target.value)}>{series.models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><ChevronDown/></div></label>
          <label>搬送物<div className={`select-wrap cargo ${hasCargoOverrides?'has-cargo-overrides':''}`}><select value={cargoTypeId} onChange={e=>setCargoTypeId(e.target.value)}>{model.cargoTypes.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown/></div></label>
          <label>パラメータNo.<div className="select-wrap parameter-number"><select value={parameterNumber} onChange={e=>setParameterNumber(e.target.value)}><option value="">すべて</option>{parameterNumbers.map(number=><option key={number} value={number}>{number}</option>)}</select><ChevronDown/></div></label>
          <label>単位分類<div className="select-wrap unit-category-filter"><select value={unitCategoryFilter} onChange={e=>setUnitCategoryFilter(e.target.value)}><option value="">すべて</option>{filterUnitCategories.map(value=><option key={value} value={value}>{value}</option>)}</select><ChevronDown/></div></label>
          <label className="search-label">検索<div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="No・名称・説明・備考を検索"/>{query&&<button onClick={()=>setQuery('')}><X size={16}/></button>}</div></label>
          <div className="mode-block"><span>モード</span><button className={'mode '+(edit?'editing':'')} onClick={()=>edit?cancel():beginEdit()}><span className="toggle"><i/></span>{edit?<><Pencil/>編集モード</>:<><Check/>参照モード</>}</button></div>
        </div>
        <div className="context"><div><b>{series.name}</b><span>{series.description}</span><i>›</i><strong className={isBaseModel?'base-model':hasModelOverrides?'has-model-overrides':''}>{model.name}</strong><i>›</i><strong className={`cargo-badge ${hasCargoOverrides?'has-cargo-overrides':''}`}>{cargoType.name}</strong></div><div className="cloud-actions"><button disabled={!userId||syncState==='uploading'} onClick={()=>uploadCloud()}><UploadCloud size={17}/>クラウドへバックアップ</button><button disabled={!userId} onClick={restoreCloud}>↓ クラウドから更新</button>{(syncState==='conflict'||syncState==='cloud-newer')&&<button className="resolve-conflict" onClick={()=>setConflictOpen(true)}><AlertTriangle/>競合を確認・解決</button>}</div><div className="local-actions"><button onClick={()=>localImportRef.current?.click()}><Upload size={17}/>ローカルへインポート</button><button disabled={!envelope} onClick={exportLocalBackup}><Download size={17}/>ローカルへエクスポート</button></div><button onClick={()=>setImportOpen(true)}><Import size={17}/> Excel / CSV インポート</button><input ref={localImportRef} hidden type="file" accept="application/json,.json" onChange={event=>{const file=event.target.files?.[0];if(file)importLocalBackup(file);event.target.value=''}}/></div>
        {(syncState==='cloud-newer'||syncState==='conflict'||syncState==='error')&&<div className={`cloud-alert ${syncState}`}><AlertTriangle/>{syncState==='cloud-newer'?'別のPCで、より新しいデータが保存されています':syncState==='conflict'?'ローカルとクラウドの変更が競合しています。自動バックアップを停止しました':cloudError}</div>}
      </section>

      {edit&&<section className="editbar" role="status" aria-label="編集モード"><div><Pencil/><span><b>編集中：{editScope==='series'?'シリーズ共通値':editScope==='model'?'この型式だけ':`搬送物 ${cargoType.name} だけ`}</b><small>{editScope==='series'?'青色は全型式の共通値です':editScope==='model'?'紫色は型式固有値です':'ピンク色は選択中の搬送物だけを変更します'}</small></span><div className="scope"><button className={editScope==='series'?'active':''} onClick={()=>setEditScope('series')}>シリーズ共通値</button><button className={editScope==='model'?'active':''} disabled={isBaseModel} title={isBaseModel?'HU300-M3は基本型式のため、シリーズ共通値を編集してください':undefined} onClick={()=>setEditScope('model')}>{isBaseModel?'基本型式（固有値なし）':'この型式だけ'}</button><button className={editScope==='cargo'?'active':''} onClick={()=>setEditScope('cargo')}>この搬送物だけ</button></div></div><div><button className="cancel" onClick={cancel}><X/>キャンセル</button><button className="save" onClick={persist}><Save/>変更を保存</button></div></section>}

      <section className="table-card">
        <div className="table-head"><div><h2>パラメータ一覧</h2><span>{rows.length} 件</span><em className={isBaseModel?'base-model':hasModelOverrides?'has-model-overrides':''}>{model.name}</em><em className={`cargo-badge ${hasCargoOverrides?'has-cargo-overrides':''}`}>{cargoType.name}</em><button className="excel-export" disabled={!rows.length} onClick={exportParameterExcel}><Sheet/>Excel出力</button></div><div className="legend"><span><i className="common"/>共通値</span><span><i className="specific"/>型式固有値</span><button className={onlyDiff?'active':''} onClick={()=>setOnlyDiff(v=>!v)}><Filter/>型式・搬送物の差分 <b>{new Set([...Object.keys(model.overrides),...Object.keys(cargoType.overrides)]).size}</b></button></div></div>
        <div className="table-scroll">{edit&&<datalist id="unit-category-options">{filterUnitCategories.map(value=><option key={value} value={value}/>)}</datalist>}<table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}{edit&&<th/>}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className={row.changedFields.length?'changed':''}>{columns.map(c=>{
          const changed=row.changedFields.includes(c.key); const editable=edit&&!['id','number'].includes(c.key);
          return <td key={c.key} className={`${c.key} ${changed?'cell-changed':''} ${row.cargoChangedFields.includes(c.key)?'cargo-changed':''}`}>{c.key==='number'&&<span className="origin-dot"/>}{editable?(c.multiline?<textarea value={String(row[c.key]??'')} rows={5} placeholder="設定値の詳細を入力（Enterで改行）" onInput={handleFieldInput(row,c.key)}/>:<input value={String(row[c.key]??'')} list={c.key==='unitCategory'?'unit-category-options':undefined} placeholder={c.key==='unitCategory'?'選択または新規入力':undefined} title={c.key==='unitCategory'?'過去の入力から選択、または新しい分類を入力できます':undefined} onInput={handleFieldInput(row,c.key)}/>):<><span className={c.multiline?'multiline-value':undefined}>{query&&searchKeys.includes(c.key)?highlightMatches(String(row[c.key]??''),query):String(row[c.key]??'')}</span>{changed&&<small>{row.cargoChangedFields.includes(c.key)?'搬送物固有':'型式固有'}</small>}</>}</td>})}{edit&&<td className="row-actions"><button className="reset" title="共通値に戻す" disabled={editScope==='cargo'?!row.cargoChangedFields.length:!Object.keys(model.overrides[row.id]??{}).length} onClick={()=>resetOverride(row.id)}><RotateCcw/></button><button className="delete-row" title="この行を削除" aria-label={`パラメータNo. ${row.number}を削除`} onClick={()=>setDeleteTarget(row)}><Trash2/></button></td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty">条件に一致するパラメータはありません</div>}</div>
        <footer><span>表示中：{rows.length} / {series.parameters.length} 件</span><span><i/> データはこのブラウザの IndexedDB に保存されます</span></footer>
      </section>
    </main>
    {importOpen&&<div className="modal-back" onMouseDown={()=>!importing&&setImportOpen(false)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-x" disabled={importing} onClick={()=>setImportOpen(false)}><X/></button><div className="modal-icon"><FileSpreadsheet/></div><h2>Excel / CSV インポート</h2><p>対象：<b>{series.name}</b> / <b>{model.name}</b> / <b>{cargoType.name}</b></p><button className="template-download" onClick={downloadImportTemplate}><Download/>インポート用ExcelフォーマットをDL</button><div className="import-rules"><b>取り込みルール</b><ul><li><strong>主キー：</strong>パラメータNoを対象シリーズ内で照合します。</li><li><strong>既存番号：</strong>登録済みのため変更せずスキップします（上書きしません）。</li><li><strong>新規番号：</strong>新しい行として追加します。</li><li><strong>空白セル：</strong>新規行では空文字として登録します。</li><li><strong>Noが空白の行：</strong>読み飛ばします。</li><li><strong>追加列：</strong>削除せず追加項目として保持します。</li></ul></div><div className="import-scope"><label><input type="radio" name="import" checked={importScope==='series'} onChange={()=>setImportScope('series')}/> シリーズ共通データ</label><label><input type="radio" name="import" disabled={isBaseModel} checked={importScope==='model'} onChange={()=>setImportScope('model')}/> {isBaseModel?'基本型式のため選択不可':'型式固有データ'}</label></div>{importError&&<div className="import-error">{importError}</div>}<div className={`drop ${importing?'loading':''}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f&&!importing)importFile(f)}} onClick={()=>!importing&&fileRef.current?.click()}><UploadCloud/><b>{importing?'読み込み・登録中…':'ファイルをドロップ'}</b><span>またはクリックして選択</span><small>.xlsx / .xls / .csv（先頭シートを読み込み）</small></div><input ref={fileRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e=>{const file=e.target.files?.[0];if(file)importFile(file);e.target.value=''}}/></div></div>}
    {toast&&<div className="toast" role="status" aria-live="polite"><Check/>{toast}</div>}
    {deleteTarget&&<div className="modal-back confirm-back" role="presentation" onMouseDown={()=>setDeleteTarget(null)}><div className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" onMouseDown={event=>event.stopPropagation()}><div className="confirm-icon"><AlertTriangle/></div><h2 id="delete-title">この行を削除しますか？</h2><p><b>パラメータNo. {deleteTarget.number}</b>{(deleteTarget.name||deleteTarget.display)&&(deleteTarget.name||deleteTarget.display)!=='-'?`「${deleteTarget.name||deleteTarget.display}」`:''}を削除します。</p><div className="delete-warning">シリーズ共通の行と、すべての型式固有値が削除対象になります。変更を保存するまではキャンセルできます。</div><div className="confirm-actions"><button onClick={()=>setDeleteTarget(null)}>削除しない</button><button className="confirm-delete" onClick={deleteRow}><Trash2/>行を削除</button></div></div></div>}
    {conflictOpen&&<div className="modal-back confirm-back" onMouseDown={()=>setConflictOpen(false)}><div className="confirm-dialog conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title" onMouseDown={event=>event.stopPropagation()}><div className="confirm-icon"><AlertTriangle/></div><h2 id="conflict-title">クラウドとの競合を解決</h2><p>{syncState==='cloud-newer'?'クラウドに、このPCより新しいデータが保存されています。':'別のPCで更新された可能性があるため、自動バックアップを停止しています。'}</p>
      {envelope&&cloudBackup?<><div className="backup-comparison neutral">
        <section className={newerSide==='local'?'is-newer':undefined}><b>このPC（ローカル）{newerSide==='local'&&<em>新しい</em>}</b><dl><dt>更新日時</dt><dd>{formatDate(envelope.updatedAt)}</dd><dt>データ世代</dt><dd>{envelope.dataVersion}</dd><dt>パラメータ件数</dt><dd>{localParameterCount}件</dd><dt>最終更新した端末</dt><dd>{deviceLabel(envelope.deviceId)}</dd></dl></section>
        <span>↔</span>
        <section className={newerSide==='cloud'?'is-newer':undefined}><b>クラウド{newerSide==='cloud'&&<em>新しい</em>}</b><dl><dt>更新日時</dt><dd>{formatDate(cloudUpdatedAt)}</dd><dt>データ世代</dt><dd>{cloudBackup.envelope.dataVersion}</dd><dt>パラメータ件数</dt><dd>{cloudParameterCount}件</dd><dt>最終更新した端末</dt><dd>{deviceLabel(cloudBackup.envelope.deviceId)}</dd></dl></section>
      </div><div className="conflict-verdict">{newerSide==='local'?'更新日時では、このPCのデータの方が新しいです。クラウドから更新すると、このPCの変更が失われる可能性があります。':newerSide==='cloud'?'更新日時では、クラウドのデータの方が新しいです。':'更新日時が同じため、日時だけでは判断できません。データ世代とパラメータ件数を確認してください。'}</div></>:<div className="conflict-verdict">クラウド側の情報を取得できていません。通信状態を確認してから、もう一度開いてください。</div>}
      <div className={`conflict-choice ${newerSide==='local'?'':'recommended'}`}><b>{newerSide==='local'?'':'推奨：'}クラウドの最新版を取得</b><span>このPCのデータをクラウドの内容へ更新します。実行前にもう一度確認します。</span><button onClick={()=>{setConflictOpen(false);restoreCloud()}}>クラウドから更新</button></div><div className={`conflict-choice ${newerSide==='local'?'recommended':''}`}><b>{newerSide==='local'?'推奨：先にローカルデータを保全':'現在のローカルデータを確認'}</b><span>{newerSide==='local'?'このPCのデータの方が新しいため、画面へ戻り「ローカルへエクスポート」で保全してから判断してください。':'何も変更せず画面へ戻り、必要な内容を確認・エクスポートできます。'}</span><button onClick={()=>setConflictOpen(false)}>ローカルを確認する</button></div><details open={newerSide==='local'}><summary>非推奨：クラウドをローカルデータで上書き</summary><p>クラウド側の新しい変更が失われる可能性があります。内容を確認できた場合だけ実行してください。</p><button className="danger-force" onClick={()=>setForceConfirmOpen(true)}>このPCのデータでクラウドを上書き</button></details></div></div>}
    {forceConfirmOpen&&<div className="modal-back confirm-back" onMouseDown={()=>setForceConfirmOpen(false)}><div className="confirm-dialog overwrite-dialog" role="alertdialog" aria-modal="true" aria-labelledby="overwrite-title" onMouseDown={event=>event.stopPropagation()}><div className="confirm-icon"><AlertTriangle/></div><h2 id="overwrite-title">クラウドを上書きしますか？</h2><p>次のクラウドデータが、このPCのローカルデータへ置き換わります。</p><div className="backup-comparison"><section><b>上書きするローカル</b><dl><dt>更新日時</dt><dd>{formatDate(envelope?.updatedAt)}</dd><dt>世代</dt><dd>{envelope?.dataVersion??0}</dd><dt>パラメータ件数</dt><dd>{localParameterCount}件</dd></dl></section><span>→</span><section className="will-replace"><b>上書きされるクラウド</b><dl><dt>データ更新日時</dt><dd>{formatDate(cloudBackup?.envelope.updatedAt)}</dd><dt>サーバー更新日時</dt><dd>{formatDate(cloudBackup?.serverUpdatedAt)}</dd><dt>世代</dt><dd>{cloudBackup?.envelope.dataVersion??'不明'}</dd><dt>パラメータ件数</dt><dd>{cloudBackup?`${cloudParameterCount}件`:'不明'}</dd></dl></section></div><div className="delete-warning">クラウド側だけにある変更は失われます。通常は「クラウドから更新」を使用してください。</div><div className="confirm-actions"><button onClick={()=>setForceConfirmOpen(false)}>キャンセル</button><button className="confirm-delete" onClick={forceUploadCloud}>内容を確認して上書き</button></div></div></div>}
    {authOpen&&<div className="modal-back" onMouseDown={()=>setAuthOpen(false)}><div className="auth-dialog cloud-settings" onMouseDown={event=>event.stopPropagation()}><button className="modal-x" onClick={()=>setAuthOpen(false)}><X/></button><div className="settings-title"><CloudCog/><div><h2>クラウドバックアップ設定</h2><p>Supabase Storageへの接続とログインを設定します。</p></div></div><div className={`setup-status ${cloudConfigured?'ready':'missing'}`}>{cloudConfigured?<Check/>:<AlertTriangle/>}<div><b>{cloudConfigured?'Supabase接続設定済み':'Supabase接続情報を入力してください'}</b><span>Project Settings → APIで確認できます。</span></div></div>{cloudError&&<div className="import-error">{cloudError}</div>}<label>Supabase URL<input type="url" placeholder="https://xxxx.supabase.co" value={supabaseUrl} onChange={event=>setSupabaseUrl(event.target.value)}/></label><label>Anon Key<input type="password" placeholder="SupabaseのAnon Key" value={supabaseAnonKey} onChange={event=>setSupabaseAnonKey(event.target.value)}/></label><button className="auth-submit" disabled={!supabaseUrl||!supabaseAnonKey} onClick={applyCloudSettings}>接続設定を保存</button><p className="settings-note">Anon Keyは公開クライアント用のキーです。Service Role Keyは絶対に入力しないでください。設定はこのブラウザ内に保存されます。</p>{cloudConfigured&&<><hr/><label>メールアドレス<input type="email" value={email} onChange={event=>setEmail(event.target.value)}/></label><label>パスワード<input type="password" value={password} onChange={event=>setPassword(event.target.value)}/></label><button className="auth-submit" disabled={!email||!password} onClick={login}>ログイン</button><button className="remove-cloud-settings" onClick={removeCloudSettings}>接続設定を削除</button></>}</div></div>}
  </div>
}
