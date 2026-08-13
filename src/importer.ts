import type { Override, Parameter, Series } from './types';

const aliases: Record<string, keyof Parameter> = {
  'パラメータno': 'number', 'パラメータno.': 'number', 'パラメータ番号': 'number',
  '標準的な値': 'standardValue', '標準値': 'standardValue', '単位': 'unit',
  'パラメータ名称': 'name', 'パラメータ名': 'name', '設定値詳細': 'detail',
  '単位分類': 'unitCategory', '備考': 'note',
};
const editableKeys: (keyof Omit<Parameter, 'id' | 'number'>)[] = ['standardValue','unit','name','detail','unitCategory','note','extra'];
const normalizeHeader=(value:unknown)=>String(value??'').replace(/^\uFEFF/,'').replace(/[\s　_]+/g,'').toLowerCase();
const cell=(value:unknown)=>value===null||value===undefined?'':String(value).replace(/\r\n/g,'\n').trim();

export type ImportResult={parameters:Parameter[];skippedRows:number;unknownColumns:string[]};

/** Maps Japanese headings and retains unknown, future columns in `extra`. */
export function recordsToParameters(records:Record<string,unknown>[]):ImportResult {
  const unknown=new Set<string>(); let skippedRows=0; const parameters:Parameter[]=[];
  records.forEach((record,index)=>{
    const values:Partial<Parameter>={}; const extra:Record<string,unknown>={};
    Object.entries(record).forEach(([heading,raw])=>{
      const key=aliases[normalizeHeader(heading)];
      if(key)(values as Record<string,unknown>)[key]=cell(raw);
      else if(heading&&raw!==''&&raw!==null&&raw!==undefined){extra[heading]=raw;unknown.add(heading)}
    });
    const number=cell(values.number); if(!number){skippedRows++;return}
    parameters.push({id:`import-${number}-${index}`,number,standardValue:cell(values.standardValue),unit:cell(values.unit),name:cell(values.name),detail:cell(values.detail),unitCategory:cell(values.unitCategory),note:cell(values.note),...(Object.keys(extra).length?{extra}:{})});
  });
  return {parameters,skippedRows,unknownColumns:[...unknown]};
}

export function applyImport(series:Series,modelId:string,incoming:Parameter[],scope:'series'|'model') {
  const next=structuredClone(series); const model=next.models.find(item=>item.id===modelId);
  if(!model)throw new Error('対象型式が見つかりません。');
  incoming.forEach(item=>{
    let base=next.parameters.find(parameter=>parameter.number===item.number);
    if(!base){
      base=scope==='series'?{...item,id:crypto.randomUUID()}:{id:crypto.randomUUID(),number:item.number,standardValue:'',unit:'',name:'',detail:'',unitCategory:'',note:''};
      next.parameters.push(base);
      if(scope==='model')model.overrides[base.id]=toOverride(item,base);
      return;
    }
    if(scope==='series'){const id=base.id;Object.assign(base,item,{id})}
    else {const override=toOverride(item,base);if(Object.keys(override).length)model.overrides[base.id]=override;else delete model.overrides[base.id]}
  });
  next.parameters.sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}));
  return next;
}

function toOverride(item:Parameter,base:Parameter):Override {
  const result:Override={}; editableKeys.forEach(key=>{
    if(key==='extra'){if(item.extra&&JSON.stringify(item.extra)!==JSON.stringify(base.extra))result.extra=item.extra;return}
    if(item[key]!==base[key])result[key]=item[key];
  }); return result;
}
