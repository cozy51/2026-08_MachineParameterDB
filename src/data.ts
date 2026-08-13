import type { Series } from './types';

export const seedData: Series[] = [
  { id:'src350', name:'SRC350', description:'小型クローラクレーン', models:[
    {id:'src350-m2',name:'SRC350-M2',overrides:{'p4':{}}},
    {id:'src350-m3',name:'SRC350-M3',overrides:{
      p1:{standardValue:'1'}, p3:{standardValue:'30',note:'M3 油圧回路仕様'},
      p5:{detail:'0: 標準モード / 1: 省エネモード / 2: 高負荷モード',standardValue:'1'}
    }}], parameters:[
      {id:'p1',number:'7001',standardValue:'0',unit:'—',name:'走行モード選択',detail:'0: 標準 / 1: 低速精密走行',unitCategory:'選択値',note:'出荷時設定'},
      {id:'p2',number:'7002',standardValue:'85',unit:'%',name:'走行最高速度制限',detail:'走行レバー最大入力時の出力上限を設定します。周囲の安全を確認して変更してください。',unitCategory:'比率',note:''},
      {id:'p3',number:'7010',standardValue:'25',unit:'MPa',name:'主回路リリーフ圧',detail:'メイン油圧回路のリリーフ圧力。サービス担当者以外は変更しないでください。',unitCategory:'圧力',note:'要サービス権限'},
      {id:'p4',number:'7021',standardValue:'3.5',unit:'s',name:'旋回加速時間',detail:'旋回操作開始から設定速度に到達するまでの時間です。',unitCategory:'時間',note:''},
      {id:'p5',number:'7045',standardValue:'0',unit:'—',name:'エンジン出力制御',detail:'0: 標準モード / 1: 省エネモード',unitCategory:'選択値',note:''},
      {id:'p6',number:'7102',standardValue:'1200',unit:'rpm',name:'アイドル回転数',detail:'無負荷時のエンジン回転数を指定します。',unitCategory:'回転速度',note:'暖機後に確認'},
      {id:'p7',number:'7120',standardValue:'10',unit:'min',name:'オートアイドル待機時間',detail:'操作がない状態からオートアイドルへ移行するまでの時間。',unitCategory:'時間',note:''},
      {id:'p8',number:'7201',standardValue:'ON',unit:'—',name:'過負荷警報',detail:'定格荷重に近づいた際の警報を有効化します。',unitCategory:'ON/OFF',note:'OFF非推奨'},
    ]},
  { id:'hu300', name:'HU300', description:'油圧式ユニット', models:[{id:'hu300-m3',name:'HU300-M3',overrides:{}}], parameters:[
    {id:'h1',number:'7001',standardValue:'0',unit:'—',name:'運転モード',detail:'0: 標準 / 1: メンテナンス',unitCategory:'選択値',note:''},
    {id:'h2',number:'7010',standardValue:'22',unit:'MPa',name:'主回路リリーフ圧',detail:'主油圧回路の圧力上限です。',unitCategory:'圧力',note:'要サービス権限'},
  ]}
];
