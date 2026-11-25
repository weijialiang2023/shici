# 中国大陆网络部署方案

## 结论

GitHub Pages 只保留为开发预览和灾备部署，不作为中国大陆主要生产站。

原因：

- GitHub Pages 在中国大陆不同运营商、地区和时段的访问质量不稳定；
- GitHub Issue 无法作为可靠的主要反馈和购买入口；
- 大陆用户首次访问仍要下载 HTML、应用脚本和词书分段；
- PWA 只有首次成功打开并完成缓存后，才能改善后续离线体验；
- Service Worker 不能解决首次访问、DNS、跨境连接和微信内置浏览器的限制。

正式站必须使用自己的域名和大陆可稳定访问的静态托管/CDN。当前应用没有后端依赖，迁移不需要改业务代码。

## 推荐路线

### 路线 A：已有备案域名

优先使用：

- 腾讯云 COS + CDN + 自定义域名；或
- 阿里云 OSS + CDN + 自定义域名。

条件：

- 已完成 ICP 备案的域名；
- 实名认证的云账号；
- 有效 HTTPS 证书；
- CDN 支持中国大陆加速。

目标：

- 大陆三网首屏稳定；
- HTTP/2 或 HTTP/3；
- Brotli/Gzip；
- 静态资源可长期缓存；
- 支持微信内打开。

### 路线 B：暂时没有备案

可以先用：

- 香港或新加坡对象存储静态网站；
- 自有域名和 HTTPS；
- 国内可访问的 CDN 套餐。

这通常比 GitHub Pages 更可控，但不等同于大陆节点加速，仍需用移动、联通、电信真实网络测试。不要在没有测试数据时宣称“国内高速”。

## 构建静态包

```sh
cd "/Users/weijialiang/WorkBuddy AI/2026-11-21-19-33-44/shici"
./tools/package_static.sh
```

默认输出：

```text
dist/shici-static-YYYYMMDD-HHMMSS.zip
```

也可以指定路径：

```sh
./tools/package_static.sh /tmp/shici-production.zip
```

包内不包含：

- `progress/` 本机学习记录；
- `tools/source/` 未授权源文件；
- `.git/`；
- 开发报告和测试截图。

## 上传配置

1. 将 zip 解压到对象存储静态网站根目录。
2. 默认首页设为 `index.html`。
3. 绑定自定义域名和 HTTPS。
4. 开启 Brotli 或 Gzip。
5. 开启 HTTP/2 或 HTTP/3。
6. 设置 MIME：

```text
.html        text/html; charset=utf-8
.js          application/javascript; charset=utf-8
.json        application/json; charset=utf-8
.webmanifest application/manifest+json; charset=utf-8
.svg         image/svg+xml
```

## 缓存策略

| 资源 | 建议缓存 |
| --- | --- |
| `sw.js` | `no-cache`，每次重新验证 |
| `index.html` | `no-cache` 或最长 5 分钟 |
| `offline.html` | 最长 5 分钟 |
| `manifest.webmanifest` | 最长 1 小时 |
| `css/styles.css?v=39` | 一年 immutable |
| `js/*.js?v=39` | 一年 immutable |
| `data/books/*.manifest.js?v=27` | 一年 immutable |
| `data/books/*.chunk-*.js?v=27` | 一年 immutable |
| 图片和图标 | 一年 immutable |

应用版本变化时必须同时更新 HTML 中的 `?v=` 和 Service Worker 缓存版本。词书内容变化必须更新 `v27`。

## 正式上线前网络测试

至少测试：

- 中国移动 4G/5G；
- 中国联通 4G/5G；
- 中国电信 4G/5G；
- 家庭宽带；
- 微信 iOS 内置浏览器；
- 微信 Android 内置浏览器；
- QQ 浏览器；
- iOS Safari；
- Android Chrome；
- 华为、小米等系统浏览器。

每项记录：

- DNS 时间；
- HTTPS 建连时间；
- 首页可交互时间；
- 首次词书分段完成时间；
- 第二次热启动时间；
- 断网后能否打开；
- Service Worker 是否受控；
- 是否存在脚本、字体或第三方资源失败。

建议门禁：

- 大陆常见 4G 下首页可交互中位数不超过 2.5 秒；
- 首屏应用内启动不超过 3 秒；
- 热启动不超过 1.5 秒；
- 首屏不请求完整大学词书；
- 页面没有 Google Fonts、境外统计、境外验证码等额外依赖。

## 反馈和支付

正式生产环境：

- 反馈主渠道使用大陆可访问的表单、邮箱或企业微信，不把 GitHub Issue 作为唯一入口；
- 支持邮箱使用腾讯企业邮、飞书邮箱或其他大陆可稳定访问的服务；
- 支付使用微信、支付宝或合规平台；
- 云同步后端部署在大陆或香港可用区域，并单独做网络验证。

当前尚未配置这些账号，因此 GitHub Issue 仍保留为开发期备用渠道，并在页面标注大陆网络限制。

## 当前阻塞

真正迁移生产站还缺：

- 自有域名；
- 云账号和托管/CDN 选择；
- 域名备案或无备案路线确认；
- 公开支持邮箱；
- 真实大陆设备网络测试。

没有这些条件时，不能把 GitHub Pages 直接认定为大陆生产环境。
