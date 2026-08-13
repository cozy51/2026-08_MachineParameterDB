import { createClient, type User } from '@supabase/supabase-js';
import type { BackupEnvelope } from './types';
export const BACKUP_BUCKET='machine-parameter-backups';
export type SyncState='local'|'checking'|'synced'|'uploading'|'local-newer'|'cloud-newer'|'conflict'|'error'|'disabled';
export type CloudBackup={envelope:BackupEnvelope;serverUpdatedAt?:string};
const SETTINGS_KEY='machine-parameter-supabase-settings';
type CloudSettings={url:string;anonKey:string};
export function loadCloudSettings():CloudSettings|null{try{const saved=localStorage.getItem(SETTINGS_KEY);if(saved){const parsed=JSON.parse(saved) as CloudSettings;if(parsed.url&&parsed.anonKey)return parsed}}catch{return null}const url=import.meta.env.VITE_SUPABASE_URL;const anonKey=import.meta.env.VITE_SUPABASE_ANON_KEY;return url&&anonKey?{url,anonKey}:null}
const initialSettings=loadCloudSettings();
export let supabase=initialSettings?createClient(initialSettings.url,initialSettings.anonKey):null;
export function saveCloudSettings(settings:CloudSettings){const normalized={url:settings.url.trim().replace(/\/$/,''),anonKey:settings.anonKey.trim()};if(!/^https:\/\/.+\.supabase\.co$/i.test(normalized.url))throw new Error('Supabase URLの形式を確認してください。');if(normalized.anonKey.length<20)throw new Error('Anon Keyを確認してください。');localStorage.setItem(SETTINGS_KEY,JSON.stringify(normalized));supabase=createClient(normalized.url,normalized.anonKey)}
export function clearCloudSettings(){localStorage.removeItem(SETTINGS_KEY);supabase=null}
export const backupPath=(userId:string)=>`${userId}/MachineParameterDB-latest.json`;
export const currentUser=async():Promise<User|null>=>supabase?(await supabase.auth.getUser()).data.user:null;
export async function signIn(email:string,password:string){if(!supabase)throw new Error('Supabase環境変数が設定されていません。');const{error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error}
export async function signOut(){await supabase?.auth.signOut()}
export async function downloadBackup(userId:string):Promise<CloudBackup|null>{
 if(!supabase)throw new Error('Supabaseが設定されていません。');const path=backupPath(userId);const{data,error}=await supabase.storage.from(BACKUP_BUCKET).download(path);
 if(error){if(/not found|does not exist|404/i.test(error.message))return null;throw error}const envelope=validateBackup(JSON.parse(await data.text()));
 const{data:list}=await supabase.storage.from(BACKUP_BUCKET).list(userId,{search:'MachineParameterDB-latest.json'});return{envelope,serverUpdatedAt:list?.find((file:{name:string;updated_at?:string})=>file.name==='MachineParameterDB-latest.json')?.updated_at};
}
export function validateBackup(value:unknown):BackupEnvelope{if(!value||typeof value!=='object')throw new Error('バックアップJSONが不正です。');const item=value as Partial<BackupEnvelope>;if(item.schemaVersion!==1)throw new Error(`未対応のschemaVersionです: ${item.schemaVersion}`);if(!Number.isSafeInteger(item.dataVersion)||item.dataVersion===undefined||item.dataVersion<0||!item.updatedAt||!item.deviceId||!Array.isArray(item.data?.series))throw new Error('バックアップの必須項目が不正です。');return item as BackupEnvelope}
async function digest(envelope:BackupEnvelope){const bytes=new TextEncoder().encode(JSON.stringify(envelope.data));const hash=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function compareBackups(local:BackupEnvelope,cloud:BackupEnvelope):Promise<'same'|'local-newer'|'cloud-newer'|'conflict'>{const[lh,ch]=await Promise.all([digest(local),digest(cloud)]);if(local.dataVersion===cloud.dataVersion)return lh===ch?'same':'conflict';const lt=Date.parse(local.updatedAt),ct=Date.parse(cloud.updatedAt);if(local.dataVersion>cloud.dataVersion&&lt>=ct)return'local-newer';if(local.dataVersion<cloud.dataVersion&&lt<=ct)return'cloud-newer';return'conflict'}
export async function safeUpload(userId:string,local:BackupEnvelope,force=false){if(!supabase)throw new Error('Supabaseが設定されていません。');const cloud=await downloadBackup(userId);if(cloud&&!force){const relation=await compareBackups(local,cloud.envelope);if(relation==='cloud-newer'||relation==='conflict')return{uploaded:false,relation,cloud}}const body=new Blob([JSON.stringify(local,null,2)],{type:'application/json'});const{error}=await supabase.storage.from(BACKUP_BUCKET).upload(backupPath(userId),body,{contentType:'application/json',upsert:true});if(error)throw error;return{uploaded:true,relation:'same' as const,cloud}}
