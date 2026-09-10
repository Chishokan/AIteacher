# ティーチャー（男性）の画像

このフォルダに `idle.png` を置くと、設定画面の「アバター」で
「ティーチャー（男性）」を選べるようになります。

- ファイル名: `idle.png`
- サイズ: 1024 × 1024 px（正方形）推奨
- 形式: PNG。白背景のままで大丈夫です（角の丸い枠に収めて表示します）

表情を増やしたい場合は、同じキャンバス・同じ顔の位置で描いた絵を
`speaking-1.png` `speaking-2.png` `listening.png` などの名前で置き、
`src/data/avatarPresets.ts` の `male` プリセットの `images` に書き足してください。

```ts
images: {
  idle: 'avatar/male/idle.png',
  speaking: ['avatar/male/speaking-1.png', 'avatar/male/speaking-2.png'],
  listening: 'avatar/male/listening.png',
},
```
