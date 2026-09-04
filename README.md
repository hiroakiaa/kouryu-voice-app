交流君 音声通話ミニアプリ

共同描画から別タブで開く、音声専用の静的Webアプリです。

## 公開方法

`voice-app/index.html` を GitHub Pages または Firebase Hosting に配置します。

公開後、GAS本体の `work/script.html` にある以下の定数へURLを設定します。

```js
const KOURYU_VOICE_APP_URL = 'https://example.com/voice/';
```

## 仕組み

- 音声は WebRTC で端末同士を直接接続します。
- Firestore は通話状態、参加者、offer/answer/ICE candidate の一時保存に使います。
- 録音はしません。
- 1つの通話URLにつき最大4人まで参加できます。

## 運用資料

- `FOUR_PERSON_TEST.md`: 4台実機での通話確認手順
- `OPERATIONS.md`: 料金監視と予算アラートの設定
- `WHISPER-TERM-OPTIMIZATION.md`: 発話区間だけのWhisper認識、共有用語AI、料金計測
- `firestore.rules`: 通話データの項目と型を限定するFirestore Rules

## つながらない場合

学校ネットワークでP2P接続できない場合は、`rtcConfig.iceServers` にTURNサーバーを追加してください。
