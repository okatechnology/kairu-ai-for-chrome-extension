# Kairu AI for Chrome Extension - 仕様書

## 概要

Kairu AI for Chrome Extensionは、OpenAI APIを使用してブラウザ操作を自動化するChrome拡張機能です。ユーザーは自然言語で指示を出すことで、ブラウザ上での操作を自動化できます。

## 技術スタック

- **言語**: TypeScript
- **ビルドツール**: Webpack
- **マニフェスト**: Chrome Extension Manifest V3
- **API**: OpenAI Chat Completions API (gpt-5-nano)
- **ストレージ**: Chrome Storage API

## 主要機能

### 1. UI コンポーネント

#### カイルくん（キャラクター）
- **デザイン**: 🐬 絵文字を使用した円形アバター
- **配色**: 水色グラデーション (`#43a5f5` → `#1e88e5`)
- **位置**: 画面右下（デフォルト: `bottom: 20px, right: 20px`）
- **機能**:
  - クリックでパネルの開閉
  - ドラッグ&ドロップで位置変更
  - AI処理中は振り子アニメーション（`pendulum`）
  - クリック時は回転アニメーション（`spin`、反時計回り360度）
  - 影は回転せず固定

#### 操作パネル
- **表示切替**:
  - カイルくんをクリック
  - `Command + K` (Mac) / `Ctrl + K` (Windows/Linux)
- **構成要素**:
  - ヘッダー: "Kairuくん" + ゴミ箱アイコン（会話履歴リセット）
  - チャット履歴表示エリア
  - テキスト入力欄
  - 送信ボタン
  - 実行ログ（折りたたみ可能）
  - ステータス表示エリア

### 2. 会話管理

#### 会話履歴
- **保存件数**: 最大1000件
- **保存内容**: ユーザーとアシスタントのメッセージ
- **永続化**: Chrome Storage API
- **リセット**: ゴミ箱ボタンで会話履歴と実行ログを同時削除

#### メッセージ表示
- **ユーザーメッセージ**: 水色グラデーション背景（右寄せ）
- **アシスタントメッセージ**: グレー背景（左寄せ）
- **文字色**: `!important`で強制指定（ダークモード対応）

### 3. 実行ログ

- **保存件数**: 最大100件
- **ログタイプ**: info, success, error, warning
- **表示内容**: タイムスタンプ + メッセージ
- **Raw表示**: JSON等の生データを折りたたみ表示

### 4. ブラウザ操作

#### 対応アクション
1. **click**: 要素をクリック
   - `selector`または`text`で指定
2. **type**: フォームに入力
3. **navigate**: ページ遷移
4. **scroll**: スクロール（up/down）
5. **back**: ブラウザの戻る
6. **forward**: ブラウザの進む
7. **get_info**: ページ情報取得

#### 要素検出
- **可視性チェック**:
  - `display !== "none"`
  - `visibility !== "hidden"`
  - `opacity !== "0"`
  - `offsetWidth > 0`
  - `offsetHeight > 0`
- **除外**: Kairu UIの要素は検出対象外

#### ページ情報送信
- **インタラクティブ要素**: input, button, a, select等のリスト
- **HTML構造**: ページ全体のHTML（最大300,000文字）
- **送信タイミング**: 毎回デフォルトで送信

### 5. AI処理

#### モデル設定
- **モデル**: gpt-5-nano
- **会話履歴**: 最大1000件を含めて送信
- **システムプロンプト**: ブラウザ操作の指示を含む

#### 応答形式
```json
{
  "message": "ユーザーへの説明",
  "actions": [
    {"action": "type", "selector": "input[name='q']", "value": "検索ワード"},
    {"action": "click", "text": "検索"}
  ]
}
```

#### アクション実行
- **間隔**: 各アクション間800ms
- **AI操作モード**: 実行中は`isAIOperating = true`

### 6. 位置管理

#### ドラッグ&ドロップ
- **開始**: `mousedown`でドラッグ開始
- **移動**: `mousemove`で位置更新
- **終了**: `mouseup`で位置保存
- **クリック判定**: 移動距離5px未満はクリックとして扱う

#### 移動制限
- **右端**: `right >= 0`
- **左端**: `right <= window.innerWidth - containerWidth`
- **下端**: `bottom >= 0`
- **上端**: `bottom <= window.innerHeight - containerHeight`

#### 位置保存
- **形式**: `{bottom: number, right: number}`
- **保存先**: Chrome Storage API
- **復元**: ページロード時に自動復元

### 7. ページ操作制限

#### Kairuモード有効時
- **クリック**: ブロック（Kairu UI除く）
- **キーボード**: ブロック（Kairu UI除く）
- **スクロール**: `body { overflow: hidden }` で完全ブロック
- **AI操作中**: 一時的に制限解除

#### イベントブロック
- click, mousedown, mouseup
- keydown, keypress, keyup
- submit

### 8. ストレージ管理

#### 保存データ
- `kairu_logs`: 実行ログHTML
- `kairu_chat_history`: チャット履歴HTML
- `kairu_enabled`: Kairuモードの有効/無効
- `kairu_conversation`: 会話履歴（最大1000件）
- `kairu_position`: パネル位置（bottom, right）

#### データ制限
- **会話履歴**: 1000件を超えたら古いものから削除
- **実行ログ**: 100件を超えたら古いものから削除
- **HTML長**: 300,000文字を超えたら切り詰め

### 9. スタイリング

#### カラーパレット
- **プライマリ**: 水色グラデーション (`#43a5f5` → `#1e88e5`)
- **背景**: 半透明白 + ブラー効果
- **テキスト**:
  - ユーザー: `white`
  - アシスタント: `#333`
  - ステータス: `#666`

#### アニメーション
- **振り子**: AI処理中、±15度回転、1秒周期
- **回転**: クリック時、反時計回り360度、0.5秒
- **パネル表示**: 下からスライドアップ、0.3秒
- **パディング**: loading時のみ2px（0.3秒トランジション）

#### カーソル
- **通常**: `grab`
- **ドラッグ中**: `grabbing`

### 10. キーボードショートカット

- **パネル開閉**: `Command + K` (Mac) / `Ctrl + K` (Windows/Linux)
- **パネル開いた時**: 自動的に入力欄にフォーカス

## ファイル構成

```
kairu-ai-for-chrome-extension/
├── src/
│   ├── content.ts      # メインコンテンツスクリプト
│   ├── background.ts   # バックグラウンドスクリプト
│   └── popup.ts        # ポップアップUI
├── public/
│   ├── popup.html      # ポップアップHTML
│   └── icons/          # 拡張機能アイコン
├── manifest.json       # マニフェストファイル
├── webpack.config.js   # Webpack設定
├── tsconfig.json       # TypeScript設定
├── .gitignore         # Git除外設定
└── package.json       # npm設定
```

## セキュリティ

- **APIキー**: Chrome Storage APIで保存
- **HTTPS**: OpenAI APIはHTTPS通信
- **Content Security Policy**: Manifest V3に準拠
- **Permissions**: activeTab, storage, scripting

## 制限事項

- **HTML長制限**: 300,000文字まで
- **会話履歴**: 1000件まで
- **実行ログ**: 100件まで
- **トークン推定**: 文字数 ÷ 4（概算）
- **操作間隔**: 800ms固定

## 今後の拡張可能性

- [ ] カスタムアクションの追加
- [ ] 複数のAIモデル対応
- [ ] エクスポート/インポート機能
- [ ] ショートカットのカスタマイズ
- [ ] テーマのカスタマイズ
- [ ] 多言語対応
