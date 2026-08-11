# 単体音声通話アプリ

`index.html` だけで動く、交流君から独立した音声通話ページです。

## 公開URL

GitHub Pages で `voice-standalone/index.html` を `voice-standalone/index.html` として置くと、次のURLで使えます。

```text
https://hiroakiaa.github.io/kouryu-voice-app/voice-standalone/
```

このURLを開くと自動で `?call=...` が付きます。そのURLを相手に共有すると、共有された人だけが同じ音声通話に参加できます。

## Firestore Rules

単体通話では、Firestore の次の場所を使います。

```text
standaloneVoiceCalls/{callId}
standaloneVoiceCalls/{callId}/participants/{participantId}
standaloneVoiceCalls/{callId}/signals/{signalId}
```

リポジトリ直下の `firestore.rules` に単体通話用の検証ルールを用意しています。Firebase Console の Firestore ルールへ反映してください。

## 仕組み

- 音声そのものは WebRTC で端末同士を直接つなぎます。
- Firestore は参加者情報と接続用の一時データだけに使います。
- 録音はしません。
- 学校ネットワークなどでP2P接続が遮断される場合は、将来的にTURNサーバーの追加が必要です。
