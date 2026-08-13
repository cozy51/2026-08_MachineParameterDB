import type { BackupEnvelope, Series } from './types';

const DB_NAME = 'machine-parameter-db';
const STORE = 'app-data';
const KEY = 'series';
const META_KEY = 'backup-envelope';
const DEVICE_KEY = 'machine-parameter-device-id';
export function normalizeSeries(data:Series[]):Series[]{return data.map(series=>({...series,description:series.id==='hu300'?'300mm FOUP移載機':'天井搬送台車',models:series.models.map(model=>({...model,cargoTypes:model.cargoTypes?.length?model.cargoTypes:(model.id==='hu300-m3'?[{id:'foup',name:'FOUP',overrides:{}}]:[{id:'foup',name:'FOUP',overrides:{}},{id:'reticle',name:'Reticle',overrides:{}}])}))}))}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadData(): Promise<Series[] | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result ? normalizeSeries(request.result) : null);
    request.onerror = () => reject(request.error);
  });
}

export function getDeviceId(){let id=localStorage.getItem(DEVICE_KEY);if(!id){id=crypto.randomUUID();localStorage.setItem(DEVICE_KEY,id)}return id}
export async function loadEnvelope():Promise<BackupEnvelope|null>{
  const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction(STORE).objectStore(STORE).get(META_KEY);request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error)});
}
export async function ensureEnvelope(series:Series[]):Promise<BackupEnvelope>{const saved=await loadEnvelope();if(saved){saved.data.series=normalizeSeries(saved.data.series);return saved}const envelope:BackupEnvelope={schemaVersion:1,dataVersion:0,updatedAt:new Date(0).toISOString(),deviceId:getDeviceId(),data:{series:normalizeSeries(series)}};await writeEnvelope(envelope);return envelope}
export async function writeEnvelope(envelope:BackupEnvelope):Promise<void>{
  envelope.data.series=normalizeSeries(envelope.data.series);const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(envelope.data.series,KEY);tx.objectStore(STORE).put(envelope,META_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
}

export async function saveData(data: Series[]): Promise<BackupEnvelope> {
  const previous=await ensureEnvelope(data);const envelope:BackupEnvelope={schemaVersion:1,dataVersion:previous.dataVersion+1,updatedAt:new Date().toISOString(),deviceId:getDeviceId(),data:{series:data}};await writeEnvelope(envelope);return envelope;
}
