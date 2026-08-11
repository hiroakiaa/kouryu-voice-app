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
