# Kairu AI for Chrome Extension

Kairu AIをChromeブラウザで利用可能にする拡張機能です。

## 機能

- ブラウザの通常操作をブロックし、Kairuを通してのみ操作可能にする
- OpenAI APIとの統合によるチャットボット機能
- APIキーの安全な保存

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. ビルド

```bash
# 本番用ビルド
npm run build

# 開発用ビルド（ファイル監視）
npm run dev
```

### 3. Chromeへの拡張機能の読み込み

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このプロジェクトの `dist` フォルダを選択

## 使い方

1. 拡張機能のアイコンをクリックしてポップアップを開く
2. OpenAI APIキーを入力して保存
3. 「Kairuを有効化」ボタンをクリックしてKairuモードを有効化
4. Kairuモードが有効な間は、通常のブラウザ操作がブロックされます

## プロジェクト構成

```
.
├── src/
│   ├── background.ts    # バックグラウンドサービスワーカー
│   ├── content.ts       # コンテンツスクリプト（ページ操作のブロック）
│   └── popup.ts         # ポップアップUI
├── public/
│   ├── popup.html       # ポップアップHTML
│   └── icons/           # 拡張機能アイコン
├── dist/                # ビルド出力先
├── manifest.json        # 拡張機能マニフェスト
├── package.json
├── tsconfig.json
└── webpack.config.js
```

## 技術スタック

- TypeScript
- Webpack
- Chrome Extensions Manifest V3
- OpenAI API

## 注意事項

- この拡張機能は、有効化すると通常のブラウザ操作をブロックします
- 必ず無効化できるようにしてください
- APIキーは安全に管理してください
