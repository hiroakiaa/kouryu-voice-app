# 運用と料金監視

## 自動的に止まる仕組み

- 通話中に別のアプリやタブへ移っても、非表示時間だけでは自動退室しない。画面へ戻ると音声と接続状態を自動で再確認する。
- 通話中は5秒ごとにWebRTC統計を確認し、回線品質に応じて送信音声を最大48・32・24kbpsで自動調整する。
- 相手が発話中なのに音声パケットが約10秒進まない場合と、対応ブラウザーで回線切替を検出した場合はICE経路を自動修復する。
- 通話時間そのものに自動終了の上限はない。終了・退室ボタンで明示的に終了する。
- 未参加状態の参加者監視は10分で停止する。
- 退室時にマイク、WebRTC peer、Firestore listener、timerを停止する。
- 古い参加者は最終更新時刻から判定して一覧から除外する。

## 定期確認

- 4台・10分の確認ごとに reads、writes、deletes、`activeListenersNow`、接続peer数を記録する。
- 全員退室後に `activeListenersNow: 0` を確認する。
- Firestore Usageを週1回確認する。
- Google Cloudの予算通知は、利用停止機能ではなく異常増加の早期発見用として設定する。

## Firestore Rules

`firestore.rules` は対象コレクション、通話ID、参加者・シグナルの項目、型、文字数を制限します。アプリはFirebase匿名認証を使うため端末ごとのUIDは検証できますが、職員本人や役職を組織アカウントとして証明するものではありません。4人制限は固定4枠のTransaction、アプリの参加前判定、競合時の追加参加者切断で守ります。

Rulesを変更したときは、対象プロジェクトが `test-project-579c6` であることを確認してからデプロイし、本番で参加・退室・再接続を確認します。

固定4枠は `slots/A` 〜 `slots/D` をTransactionで取得します。Rulesが未反映の場合はアプリが従来の4人判定へ自動的に戻るため、通話自体は停止しません。Firebaseへログイン済みの環境では `firebase deploy --only firestore:rules` で固定枠を有効化できます。

## Cloudflare TURNの運用

- Worker `kouryu-turn-credentials` はGitHub Pages以外からの呼び出しを拒否する。
- TURN認証情報はFirebase IDトークンを検証できた端末だけに発行する。
- UID・IPごとの短時間制限と、UIDごとの日次制限で認証情報の大量発行を抑止する。
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
# 2026-11-08 quality-30 再開メモ

- 更新番号: `2026-11-08-quality-30` / Service Worker: `v152`
- 実施: 現行導線とずれていた17検証を修復し、状態選択の説明・動的読み上げ・キーボード焦点・タッチ寸法・動きを減らす設定・強制配色対応など13項目を補強。
- 検証: `node --test tests/*.test.mjs` は305件すべて成功、`node --check phone-app.js` 成功。
- 配布: ルートと `voice-standalone` の `index.html` / `phone-app.js` / `phone-theme.css` / `service-worker.js` を同期済み。
- 公開経路: Git認証が端末CLIから利用できない場合は、ログイン済みGitHubブラウザーのファイルアップロードを使用する。公開後はGitHub Pagesの更新番号と状態選択UIを実画面で確認する。

