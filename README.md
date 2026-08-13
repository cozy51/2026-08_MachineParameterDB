# 機械パラメータ管理

React + Vite + TypeScript で構築した、機種シリーズ／派生型式ごとのパラメータ管理アプリです。

## 主な機能

- SRC350の名称は「天井搬送台車」、HU300の名称は「300mm FOUP移載機」。シリーズ → 型式 → 搬送物の3階層で差分を保持
- SRC350-M2/M3はFOUP・Reticle、HU300-M3はFOUPを選択可能
- SRC350はSRC350-M2／FOUPを基本選択とし、搬送物固有値は塗りつぶさず赤い文字と左線で型式固有値から独立して表示
- パラメータNo.は独立したドロップダウンで選択し、名称・詳細・備考はキーワード検索
- 単位分類は上部と表の「単位分類」列見出しのドロップダウンから絞り込み、表示中一覧をExcel出力
- 型式固有値のハイライトと差分フィルター
- 型式固有値がある型式は、型式選択欄と型式ラベルも同じ暖色で表示
- 参照／編集モード、共通値／型式固有値の編集先切替、保存／キャンセル
- 型式固有値を削除して共通値へ戻す操作
- 単位分類は過去に登録した候補から選択でき、新しい分類も直接入力可能
- 設定値詳細は複数行入力に対応し、入力した改行を一覧でも維持
- 編集モードでは確認ダイアログを経て行を削除可能（保存前ならキャンセル可能）
- 編集中は画面全体と入力欄の背景色を切り替え、操作バーをスクロール中も固定表示
- シリーズ共通値の編集は青、型式単独の編集モードは紫、保存済み型式固有値は黄色で区別
- 一覧を縦スクロールしても列見出しを画面上部に固定表示
- 保存・キャンセル・削除・インポートのお知らせは4秒後に自動で非表示
- 復元可能なJSONをローカルへエクスポートし、確認・検証付きでインポート
- Excel / CSV のドラッグ＆ドロップ読み込みと、選択したシリーズ共通値／型式固有値への登録
- IndexedDB によるブラウザ内永続化
- `extra` オブジェクトによる将来の追加列の柔軟な保持

## 開発

```bash
npm install
npm run dev
```

本番ビルドは `npm run build`、静的解析は `npm run lint` で実行できます。

## データモデル

`Series` が共通パラメータを持ち、各 `Model` の `overrides` がパラメータ ID ごとの差分だけを保持します。表示時に共通値へ差分を合成するため、上書きを削除すると自動的にシリーズ共通値へ戻ります。永続化層は `storage.ts` に分離しており、将来 Supabase を原本、IndexedDB をキャッシュにする際に差し替えやすい構成です。

インポートは先頭シートの1行目を見出しとして読み込みます。`パラメータNo`、`標準的な値`、`単位`、`パラメータ名称`、`設定値詳細`、`単位分類`、`備考`を認識し、それ以外の列も追加項目として失わず保持します。同じパラメータNoが既にある場合は選択した登録先を更新し、新しい番号は追加します。

## Supabaseクラウドバックアップの設定

通常の検索・編集・保存は引き続きIndexedDBだけを利用し、Supabase PostgreSQLは使用しません。StorageはユーザーごとのJSONバックアップ専用です。

1. Supabase DashboardでEmail/Password認証を有効にし、利用ユーザーを作成します。
2. Storageに非公開Bucket `machine-parameter-backups` を作成します。
3. `.env.example` を `.env.local` にコピーし、`VITE_SUPABASE_URL`と`VITE_SUPABASE_ANON_KEY`を設定します。Service Role Keyはブラウザへ設定しないでください。
4. StorageのSQL Editorで、認証ユーザーが自分のフォルダーだけ操作できるPolicyを作成します。

ヘッダーの「クラウド設定」は常に開けます。画面からSupabase URLとAnon Keyを入力して保存でき、設定後すぐにログインできます。入力した接続情報はこのブラウザのlocalStorageに保存されます。`.env.local`による事前設定も引き続き利用できます。Anon Keyは公開クライアント用ですが、Service Role Keyは絶対に入力しないでください。

```sql
create policy "users read own machine backups"
on storage.objects for select to authenticated
using (bucket_id = 'machine-parameter-backups' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users insert own machine backups"
on storage.objects for insert to authenticated
with check (bucket_id = 'machine-parameter-backups' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users update own machine backups"
on storage.objects for update to authenticated
using (bucket_id = 'machine-parameter-backups' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'machine-parameter-backups' and (storage.foldername(name))[1] = auth.uid()::text);
```

保存先は`<user-id>/MachineParameterDB-latest.json`です。ローカル変更の2秒後に、クラウド最新版を再取得してから自動バックアップします。`dataVersion`、`updatedAt`、データ内容のSHA-256を併用し、クラウドが新しい場合や矛盾がある場合は自動上書きを停止し、「競合を確認・解決」画面でクラウド取得・ローカル確認・非推奨の強制上書きを選択します。強制上書き前にはローカル・クラウド双方の更新日時、世代、パラメータ件数を比較表示します。クラウド通信に失敗してもIndexedDBへの保存と通常操作は継続します。
