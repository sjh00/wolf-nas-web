# WolfNas Web

[![CI](https://github.com/sjh00/wolf-nas-web/actions/workflows/ci.yml/badge.svg)](https://github.com/sjh00/wolf-nas-web/actions/workflows/ci.yml)

**日本語** | [English](./README.md) | [中文](./README.zh-CN.md)

WolfNas のフロントエンドプロジェクトです。[Vben Admin](https://github.com/vbenjs/vue-vben-admin) をベースに構築されています。

## 技術スタック

- Vue 3 + Vite + TypeScript
- Naive UI + Tailwind CSS
- Pinia + Vue Router

## クイックスタート

```bash
# 依存関係のインストール
pnpm install

# 開発モード
pnpm dev:nexus

# ビルド
pnpm build:nexus
```

開発サーバーはデフォルトで `http://localhost:5555` で起動し、バックエンド `http://localhost:3000` にプロキシします。

## プロジェクト構成

```
apps/nexus-media/
├── src/
│   ├── api/          # API インターフェース
│   ├── components/   # 共通コンポーネント
│   ├── views/        # ページビュー
│   ├── router/       # ルーティング設定
│   ├── store/        # 状態管理
│   └── plugin-framework/  # プラグインシステム
```

## バックエンド

バックエンドリポジトリ：[wolf-nas-tools](https://github.com/sjh00/wolf-nas-tools)

## License

MIT

## 謝辞と参考

WolfNas Web は以下のオープンソースプロジェクトを基に発展しています。原作者とコミュニティの成果に感謝します。

- [nas-tools](https://github.com/NAStool/nas-tools) — 最初の NAS メディア自動化ツール
- [Nexus Media Web](https://github.com/linyuan0213/nexus-media-web)（[linyuan0213](https://github.com/linyuan0213)）— 本リポジトリが同期参考とした v4 フロントエンド
- [Vue Vben Admin](https://github.com/vbenjs/vue-vben-admin) — 管理画面テンプレート

本リポジトリは独立して保守される派生プロジェクトであり、API・ブランド・リリースサイクルは上記の上流と完全には一致しません。
