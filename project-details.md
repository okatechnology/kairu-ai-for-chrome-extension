# Kairu AI for Chrome Extension

## 概要
- かつてWindows向けに提供されていたKairu AIを、Chromeブラウザ上で利用可能にした拡張機能です。
- ただしこの拡張機能は、ただブラウジングを快適にするものではありません
- この拡張機能は、ブラウザの普通の操作をブロックし、Kairuを通してしか操作できなくします

## 技術スタック
- フロントエンド: HTML, CSS, TypeScript
- フロントエンドを通じ、OpenAI APIと通信し、チャットボット機能を実現

## 機能詳細

### UI/UX
- **Kairuくんの表示**: 画面右下に常にKairuくんのキャラクターが表示される
- **入力欄の表示**: Kairuくんにホバーすると、やりたいことを入力する欄が表示される
- **操作制限**: Kairuくん以外のすべてのページ操作（クリック、キーボード入力など）がブロックされる
- **AI対話**: 入力された内容をOpenAI APIに送信し、AIの応答を受け取る

### 実装の流れ
1. コンテンツスクリプトでKairuくんのUIを画面に挿入
2. すべてのマウス・キーボードイベントをキャプチャしてブロック
3. KairuくんのUIのみイベントを許可
4. ユーザーの入力をOpenAI APIに送信
5. AIの応答を表示し、必要に応じてページ操作を実行

### ブラウザ操作機能

AIが実行できる操作：

#### 1. クリック操作
- セレクタまたはテキストでDOM要素を検索
- 該当要素をクリック
- 例: 「ログインボタンをクリック」→ `{action: "click", selector: "button", text: "ログイン"}`

#### 2. フォーム入力
- input/textarea要素に値を入力
- 例: 「検索欄に'猫'と入力」→ `{action: "type", selector: "input[type='search']", value: "猫"}`

#### 3. ページ遷移
- 指定URLへ移動
- 例: 「Googleを開いて」→ `{action: "navigate", url: "https://google.com"}`

#### 4. スクロール
- ページの上下にスクロール
- 例: 「下にスクロール」→ `{action: "scroll", direction: "down"}`

#### 5. 情報取得
- ページタイトル、URL、テキストコンテンツの取得
- 例: 「このページのタイトルは？」→ `{action: "get_info", type: "title"}`

### AI応答フォーマット

AIは以下のJSON形式で操作を指示：

```json
{
  "message": "ユーザーへの説明メッセージ",
  "actions": [
    {
      "action": "click|type|navigate|scroll|get_info",
      "selector": "CSSセレクタ（該当する場合）",
      "value": "入力値（該当する場合）",
      "text": "要素のテキスト（該当する場合）",
      "url": "遷移先URL（該当する場合）"
    }
  ]
}
```
