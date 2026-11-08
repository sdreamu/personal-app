# 装到本机：Windows 桌面版 / Android APK

这个应用本身是纯前端（Vue 3 + Vite，hash 路由，数据在 IndexedDB，零网络）。
所以"上桌面 / 上手机"只是给它套一个壳，**业务代码一行没改**，三个出口共用一个 `dist/`：

| 出口 | 怎么跑 | 数据存在哪 |
| --- | --- | --- |
| 浏览器 | `pnpm dev` → http://127.0.0.1:5173 | 浏览器给该 origin 的 IndexedDB |
| Windows 桌面版 | `pnpm dist:win` → `release/` 里的 exe | `%APPDATA%\个人生活助手` |
| Android（进行中） | Capacitor 壳 → apk | 应用私有目录里的 WebView 存储 |

> ⚠️ **三者互不相通**：换出口等于换存储域，老数据不会自己跟过去。
> 换之前在旧版本里「设置 → 备份 → 导出 JSON」，在新版本里「导入备份」即可。

---

## 一、Windows 桌面版（Electron）

### 出包

```bash
pnpm dist:win        # = pnpm build:electron && electron-builder --win
pnpm dist:win:out    # 同上，但产物写到仓库外的 ../evan-release（本机必须用这个，见下）
```

**本机出包必须用 `dist:win:out`**：electron-builder 打 NSIS 时会先生成一个"第一遍"安装包并
**执行它**来取卸载器，而这一步在本仓库目录下会失败（该安装包在任何工作区内的目录里运行都返回
退出码 2，拷到工作区外就正常）。失败表现为安装包只停在 175KB 的中间产物，日志报
`个人生活助手-Setup-0.1.0.exe process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`。
所以输出目录要落在工作区外。

首次出包还要从 GitHub 拉 NSIS 工具链，本机直连会超时，加镜像：

```bash
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ pnpm dist:win:out
```

产物默认都在 `release/`（已 gitignore；`dist:win:out` 则在 `../evan-release`）：

- `个人生活助手-Setup-0.1.0.exe` —— NSIS 安装包，可选安装目录，建桌面 / 开始菜单快捷方式，带卸载项
> 只出安装包。免安装便携版（`portable` target）在本机验不过：launcher 起来后 90 秒内始终
> 没解出 app 进程，只在 `%TEMP%` 留下 `ns*.tmp` 解压目录。没验过的产物不发布 —— 需要时
> 可以把 `portable` 加回 `electron-builder.yml` 再调。

只想验证不打安装包：`pnpm electron:dev`（先构建再直接开 Electron 窗口）。

### 三个设计选择（改之前先看）

1. **页面从 `app://local` 加载，不是 `file://`**（`electron/main.cjs`）。
   Chromium 会拦掉 `file://` 下的 ES module 脚本（origin 是 `null`，被 CORS 拒），Vite 产出的正是 module 脚本；
   而且 `file://` 的存储 origin 是 `null`，换版本 / 换安装方式都可能把 IndexedDB 搞丢。
   自定义协议带来稳定的 origin，升级、重装都不丢数据。
2. **构建用相对 base**：`pnpm build:electron` 里是 `vite build --base=./`，产物里资源是 `./assets/...`。
   Web 版构建（`pnpm build`）保持 `/` 不变。
3. **安全基线**：`contextIsolation: true` + `nodeIntegration: false` + `sandbox: true`，不开 preload，
   `window.open` 与跳出 `app://` 的导航一律拒绝。页面拿不到任何 Node 能力。

### 运行期行为

- 单实例：再点图标只把已有窗口拉到前台，不会两个进程抢同一个数据库。
- 默认菜单已去掉（界面自带顶栏），`F12` / `Ctrl+Shift+I` 仍可开开发者工具排查。
- 首次运行 Windows SmartScreen 会提示"未知发布者"——个人自用不出签名证书，属预期；
  点"更多信息 → 仍要运行"即可。
- **数据目录**：`C:\Users\<你>\AppData\Roaming\evan-personal-app`（取 package.json 的 `name`）。
  安装目录则是 `C:\Users\<你>\AppData\Local\Programs\evan-personal-app`。卸装不会删数据（除非手动删），
  所以重装后数据还在。

### 图标

`build/icon.ico`（16/24/32/48/64/128/256 七尺寸）与 `build/icon.png`（512×512）由脚本生成：

```bash
node scripts/make-icons.mjs
```

纯 Node + zlib 手写 PNG/ICO 编码，不引图形库。改图形就改 `scripts/make-icons.mjs` 里的
`SHAPES`（512 逻辑坐标），重跑，产物一起提交。

### 冒烟验证

```bash
pnpm build:electron
node scripts/smoke-electron.mjs
```

用 Playwright 真的把 Electron 开起来，检查：标题、origin 是 `app://local`、页面不是白屏、
IndexedDB 业务库能开，并截图到 `test-results/electron-smoke.png`。

> 有的终端环境带着 `ELECTRON_RUN_AS_NODE=1`，Electron 会退化成纯 Node 开不出窗口；
> 脚本已把这个变量显式去掉。

`src/packaging/desktopPackaging.spec.ts` 是打包契约的单测（入口、安全基线、自定义协议、
electron-builder 配置、图标产物），改打包方式时先看它。

---

## 二、Android APK（Capacitor）

一条命令出包：

```bash
bash scripts/build-apk.sh            # 内含全部环境变量、junction、cap sync
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`（约 4.3MB），
本机已另存一份到 `D:\evan-release\个人生活助手-debug-1.0.apk`。

装机：手机开"允许安装未知来源"，把 apk 拷过去点开；或 `adb install -r app-debug.apk`
（adb 在 `D:\Android\Sdk\platform-tools\adb.exe`）。

### 工具链装在哪（C 盘紧张，全部在 D）

| 东西 | 位置 |
| --- | --- |
| **JDK 21**（Microsoft Build of OpenJDK 21.0.13） | `D:\tools\jdk21` |
| JDK 17（留着备用，Android 这条线用不上） | `D:\tools\jdk17` |
| Android SDK（cmdline-tools + platform-tools + platforms;android-36 + build-tools;36.0.0） | `D:\Android\Sdk` |
| Gradle 发行版与依赖缓存（Gradle 8.14.3） | `D:\gradle-home` |

**必须 JDK 21**：`android/app/capacitor.build.gradle` 里 `sourceCompatibility = VERSION_21`，
JDK 17 会在编译阶段直接失败。

### 本机踩过的四个坑（换机器可跳过 1、3、4）

1. **AGP 拒绝非 ASCII 项目路径**（`D:\Evan的专属APP` 含中文）。
   `scripts/build-apk.sh` 会先建一个 ASCII 的目录 junction `D:\evan-android -> 本仓库`，
   再在 junction 里 `pnpm build` + `cap sync` + `gradlew.bat assembleDebug`。
   建 junction 必须用 PowerShell 的 `New-Item -ItemType Junction`：cmd 的 `mklink` 经 MSYS 传参时
   目标会变成正斜杠，建出来的 junction 会出现"ls 看得到、cd 却 No such file or directory"。
2. **`./gradlew` 在这个 MSYS2 里跑不起来**（缺 `cygpath`），只能走 `cmd //c gradlew.bat`。
3. **dl.google.com / services.gradle.org / repo.maven 的 TLS 会被掐**
   （`Remote host terminated the handshake`、`SSL peer shut down incorrectly`）。已经改了：
   - `android/gradle/wrapper/gradle-wrapper.properties` → 华为云 Gradle 发行版镜像
   - `android/build.gradle`、`android/capacitor-cordova-android-plugins/build.gradle` →
     阿里云 Maven 镜像（google / public / gradle-plugin）放在官方源前面
   换到网络正常的机器可以把这些镜像删掉。
4. **AGP 默认要 build-tools 35.0.0**，本机只装了 36.0.0，它坚持去 dl.google.com 现下 → 卡死。
   已在 `android/app/build.gradle` 里显式写死 `buildToolsVersion = "36.0.0"`。

### 已验过的产物

```bash
aapt2 dump badging app-debug.apk   # package=com.evan.personalapp, versionName=1.0,
                                   # minSdk=24, targetSdk=36, label=个人生活助手
tar -tf app-debug.apk | grep assets/public/index.html   # 网页产物确实打进去了
apksigner verify --print-certs app-debug.apk            # CN=Android Debug 自签名
```

debug 包用 Gradle 自动生成的 debug 证书签名，只够自己装；要发版得自己生成 keystore 再
`assembleRelease`，那一步不在本文档范围内。

### 与 Windows 版的关系

- 一份代码三个出口：浏览器 / Electron（`electron/`）/ Android（`android/`），业务代码同一套。
- **页面 origin 不同**：Android 是 `https://localhost`（Capacitor 自带的服务），桌面版是
  `app://local`，浏览器是 `http://127.0.0.1:5173`。三者存储互不相通，
  换设备/换出口一律"旧版导出 JSON → 新版导入"。
- 导出在手机上走原生：`src/utils/download.ts` 的 `saveFile()` 在原生壳里用
  `@capacitor/filesystem` 写进应用缓存目录，再调 `@capacitor/share` 弹系统分享面板
  （WebView 里 `<a download>` 根本不落盘，用户会以为导出成功了）。取消分享不算失败。

### 手机屏冒烟（不开模拟器也能看一眼）

```bash
node scripts/smoke-mobile-web.mjs    # 390×844 视口打开 dist，断言无横向溢出 + 底部导航在 + 截图
```

### 契约测试

- `src/packaging/androidPackaging.spec.ts`：包名不能改、webDir 指向 dist、android 工程与四个
  Capacitor 依赖必须存在、出包脚本必须走 `cap sync` + `assembleDebug`。
- `src/utils/download.spec.ts` 里四条 `saveFile` 用例（浏览器下载 / 原生写盘+分享 /
  取消分享不算失败 / 写盘失败要抛错）。

### 还没验的

真机运行。本机没有连接安卓设备也没装模拟器，构建产物只验到"包结构 + 签名 + 内置资源正确"，
第一次装机时请重点看：能否正常启动、首页是否渲染、设置页导出备份是否弹出分享面板。