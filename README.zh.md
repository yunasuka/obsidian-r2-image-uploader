# R2 Image Uploader

[English](README.md)

在笔记里粘贴或拖入图片，自动上传到你自己的 [Cloudflare R2](https://developers.cloudflare.com/r2/) 存储桶，插入公开链接，图片不再存进库里。已有的本地图片也可以一条命令搬到 R2。

- **粘贴 / 拖入即上传**，上传时先显示占位符
- **不会丢图**：传不上时先按普通附件存到本地，之后自动补传（启动时、每 5 分钟、网络恢复时），传上去后自动改链接、清掉本地临时文件
- **文件名用内容哈希**（默认 `{hash}.{ext}`）：同一张图只存一份，链接永远不变
- **可选转 WebP**：上传前转换，转完没变小就传原图；GIF、SVG 不转
- **上传本地图片**：当前笔记或整个库（先预览会动哪些），保留显示尺寸和说明文字（`![[a.png|300]]` → `![|300](https://…)`）
- **密钥只存在本机**：存在 Obsidian 的密钥存储里，不写进 `data.json`，不会随库同步出去
- 电脑和手机都能用；没有第三方依赖，签名用 Web Crypto 自己实现；走 Obsidian 的 `requestUrl`，存储桶不用配 CORS

## 配置

1. **建存储桶**：Cloudflare 后台 → R2 对象存储 → 创建存储桶。
2. **开公开访问**：存储桶 → 设置 → 自定义域 → 绑一个托管在 Cloudflare 上的（子）域名，比如 `img.example.com`。`r2.dev` 地址也能用，但有限速，只适合测试。
3. **建 API 令牌**：R2 → 管理 API 令牌 → 创建帐户 API 令牌 → 权限选「对象读和写」，只给这个存储桶。记下「访问密钥 ID」和「机密访问密钥」。
4. 在 Obsidian：设置 → R2 Image Uploader，填账户 ID、存储桶、两个密钥和公开访问地址，点「测试」（会上传一个小文件，从公开地址读回来，再删掉）。

## 命令

| 命令 | 作用 |
|---|---|
| 上传当前笔记里的本地图片 | 把当前笔记嵌入的本地图片全部上传，并把嵌入改成 R2 链接 |
| 上传整个库的本地图片… | 对所有笔记做同样的事，执行前先显示涉及多少张图、多少篇笔记 |
| 补传上传失败的图片 | 立即补传因为上传失败而先存在本地的图片 |

用命令上传后，本地文件默认保留。把「上传本地文件后」改成「移到回收站」就会清掉；只有在没有任何笔记或白板再提到这个文件时才会删。

## 文件名模板

默认 `{hash}.{ext}`。可用占位符：`{hash}`（上传内容 SHA-256 的前 16 位）、`{hash:N}`、`{ext}`、`{name}`（原文件名）、`{year}`、`{month}`、`{day}`、`{timestamp}`。斜杠可以分文件夹，比如 `notes/{year}/{month}/{hash}.{ext}`。

模板里有 `{hash}` 时，已经存在的图不会重复上传；没有 `{hash}` 时，遇到同名文件绝不覆盖，而是在文件名后面加时间戳。

## 隐私和安全

- **联网**：插件只连你的 R2 S3 接口（`https://<账户 ID>.r2.cloudflarestorage.com` 或你填的地址），以及「测试连接」时访问你的公开地址。不收集任何数据。
- **上传的图片，拿到链接的人都能打开。** R2 不允许别人列出存储桶里的文件，哈希文件名也猜不到，但不要上传不能通过链接分享的内容。
- 密钥存在每台设备自己的 Obsidian 密钥存储里（每台设备填一次）。建议用只能访问图床存储桶的令牌。

## 开发

```bash
npm install
npm run dev        # 监听构建 main.js
npm test           # 单元测试（SigV4 用 AWS 官方测试向量、命名、链接改写）
npm run build      # 类型检查 + 生产构建
npm run install-vault -- /path/to/vault   # 把 main.js 和 manifest.json 拷进库里
```

R2 真实往返测试（`test/r2.e2e.test.ts`）只在存在 `.env.local`（含 `R2_ACCOUNT_ID`、`R2_BUCKET`、`R2_PUBLIC_URL`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`）时运行。

发版：推一个和 `manifest.json` 里版本号相同的 tag（比如 `0.1.0`），GitHub workflow 会构建并把 `main.js`、`manifest.json` 挂到一个草稿 Release 上。

## 许可证

MIT
