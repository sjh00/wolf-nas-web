# WolfNas Web

[![CI](https://github.com/sjh00/wolf-nas-web/actions/workflows/ci.yml/badge.svg)](https://github.com/sjh00/wolf-nas-web/actions/workflows/ci.yml)

**中文** | [English](./README.md) | [日本語](./README.ja-JP.md)

WolfNas 前端项目，基于 [Vben Admin](https://github.com/vbenjs/vue-vben-admin) 构建。

## 技术栈

- Vue 3 + Vite + TypeScript
- Naive UI + Tailwind CSS
- Pinia + Vue Router

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev:nexus

# 构建
pnpm build:nexus
```

开发服务器默认运行在 `http://localhost:5555`，代理到后端 `http://localhost:3000`。

## 项目结构

```
apps/nexus-media/
├── src/
│   ├── api/          # API 接口
│   ├── components/   # 公共组件
│   ├── views/        # 页面视图
│   ├── router/       # 路由配置
│   ├── store/        # 状态管理
│   └── plugin-framework/  # 插件系统
```

## 后端配套

后端仓库：[wolf-nas-tools](https://github.com/sjh00/wolf-nas-tools)

## License

MIT

## 致谢与参考

WolfNas Web 在以下开源项目的基础上继续演进，感谢原作者与社区的工作：

- [nas-tools](https://github.com/NAStool/nas-tools) — 最初的 NAS 媒体自动化工具
- [Nexus Media Web](https://github.com/linyuan0213/nexus-media-web)（[linyuan0213](https://github.com/linyuan0213)）— 本仓库同步参考的 v4 前端
- [Vue Vben Admin](https://github.com/vbenjs/vue-vben-admin) — 管理端模板

本仓库为独立维护的衍生项目，接口、品牌与发布节奏与上述上游并不保证完全一致。
