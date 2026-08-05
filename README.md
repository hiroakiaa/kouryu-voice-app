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
- 最初は1対1通話を想定しています。

## つながらない場合

学校ネットワークでP2P接続できない場合は、`rtcConfig.iceServers` にTURNサーバーを追加してください。
