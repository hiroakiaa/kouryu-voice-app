# 運用と料金監視

## 自動的に止まる仕組み

- 通話画面が非表示のまま2分経過すると自動退室する。
- 1回の通話は最大60分で自動退室する。
- 未参加状態の参加者監視は10分で停止する。
- 退室時にマイク、WebRTC peer、Firestore listener、timerを停止する。
- 古い参加者は最終更新時刻から判定して一覧から除外する。

## 定期確認

- 4台・10分の確認ごとに reads、writes、deletes、`activeListenersNow`、接続peer数を記録する。
- 全員退室後に `activeListenersNow: 0` を確認する。
- Firestore Usageを週1回確認する。
- Google Cloudの予算通知は、利用停止機能ではなく異常増加の早期発見用として設定する。

## Firestore Rules

`firestore.rules` は対象コレクション、通話ID、参加者・シグナルの項目、型、文字数を制限します。Firebase Authenticationを使っていないため、Rulesだけで端末本人の完全な証明や、参加者コレクションの件数を数えて5人目を拒否することはできません。4人制限はアプリの参加前判定と、同時参加が競合した場合の追加参加者切断で守ります。

Rulesを変更したときは、対象プロジェクトが `test-project-579c6` であることを確認してからデプロイし、本番で参加・退室・再接続を確認します。

固定4枠は `slots/A` 〜 `slots/D` をTransactionで取得します。Rulesが未反映の場合はアプリが従来の4人判定へ自動的に戻るため、通話自体は停止しません。Firebaseへログイン済みの環境では `firebase deploy --only firestore:rules` で固定枠を有効化できます。

## Cloudflare TURNの運用

- Worker `kouryu-turn-credentials` はGitHub Pages以外からの呼び出しを拒否する。
- IP・端末ごとの短時間・日次の認証情報発行数を制限する。
- 異常増加時はWorker環境変数 `TURN_DISABLED=true` を設定するとTURNだけを緊急停止できる。アプリは直接接続とSTUNへ自動的に切り替わる。
- TURNキーは半年ごと、または漏えいの疑いがあるときに交換する。新しいキーを作成し、Worker Secretsの `TURN_KEY_ID` と `TURN_KEY_API_TOKEN` を更新して疎通確認後、古いキーを失効する。
- キーIDやAPIトークンをGitHub、HTML、診断ログへ保存しない。

## Firebase App Check

- WebアプリはreCAPTCHA Enterpriseを使う。サイトキーは公開情報としてHTMLの `firebase-app-check-site-key` に設定する。
- 秘密鍵をHTMLへ入れない。
- 最初はメトリクスを確認し、正規端末の検証済みリクエストを確認してからFirestoreの強制適用を有効にする。
- 強制適用後はiPhone Safari、iPad Safari、PC Chromeで参加・退室・再参加を確認する。

## 障害記録

- 接続診断の「障害記録をコピー」は、この端末の直近30件だけを対象にする。
- 音声、表示名、通話URL、TURN秘密情報は保存しない。
- 保存項目は発生日時、エラー種別、接続方式、アプリ版だけとする。
