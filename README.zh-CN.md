# Enpass for Tinycast / Raycast

> [English](README.md) | 中文

不打开 Enpass 主程序，在启动器里直接搜索保险库、复制密码 / 用户名 / 一次性验证码（TOTP）。UX 对标 [alfred-enpass](https://github.com/x-o-r-r-o/alfred-enpass)。

后端为 [enpass-cli](https://github.com/hazcod/enpass-cli)（Go 编写，直接读取本地 Enpass 6 保险库文件；Enpass 无官方 API）。本扩展**只读**：不实现任何 create/edit/trash/delete 写操作。

## 命令

| 命令 | 建议 Alias | 说明 |
|---|---|---|
| Search Vault | `enp` | 解锁后在内存快照上实时模糊搜索（title / username / category / website / url） |
| Lock Vault | `enp-lock` | 立即锁定：销毁搜索命令的运行时，内存快照随之清空；钥匙串记忆模式下同时删除已存的主密码 |
| Refresh Vault | `enp-refresh` | 重建快照并直接进入搜索（会再弹一次 Touch ID / 要求主密码） |

### Search Vault 快捷键

| 键 | 动作 |
|---|---|
| ↩ | 复制密码（或粘贴，由偏好项决定）；复制后启动剪贴板倒计时清除 |
| fn↩ | 与默认动作相反（默认复制则粘贴，反之亦然） |
| ⌘↩ | 复制用户名 |
| ⌥↩ | 复制当前 TOTP 码（从快照中的 secret 用 RFC 6238 本地计算） |
| ⌃↩ | 打开网站（仅允许 http/https，其他 scheme 一律拒绝） |
| ⇧↩ | 字段详情二级列表：↩ 复制字段、⌘↩ 粘贴字段、⌃↩ 打开 URL 字段 |
| ⌘R | 原地重建快照（不离开命令，再验证一次 Touch ID / 主密码） |
| ⌘L | 立即锁定（清空内存快照） |

密码、PIN、卡号、恢复码、TOTP secret 在一切列表 UI 中打码（`••••••••`）；TOTP 字段在详情页仅显示当前 6 位码。

## 偏好项

| 偏好项 | 默认 | 说明 |
|---|---|---|
| enpass-cli Path | `/opt/homebrew/bin/enpass-cli` | 配置路径不存在时回退：`/usr/local/bin/enpass-cli` → PATH |
| Vault | Auto-detect | 候选：`~/Library/Containers/in.sinew.Enpass-Desktop/Data/Documents/Vaults/primary` → `~/Documents/Enpass/Vaults/primary` → `~/Documents/Enpass/**/Vaults/*`（判定标准：目录内存在 `vault.enpassdb`） |
| Custom Vault Path | 空 | 设置后覆盖 Vault 项。在 Enpass：Settings → Advanced → Data Location 查看路径 |
| Keyfile Path | 空 | 仅 keyfile 保护的保险库需要 |
| Unlock Method | 钥匙串记忆 | 主密码记忆于钥匙串（默认，首次输入后零提示）/ Touch ID（`-biometric`，每次弹指纹）/ Enpass 主密码（`MASTERPW`，每次输入） |
| Default ↩ Action | Copy | ↩ 是复制还是粘贴；fn↩ 恒为相反动作 |
| Clear Clipboard After | 30 秒 | 10 / 30 / 60 / 90 秒 / 永不。到时时若剪贴板已被其他内容覆盖则不清除 |
| Auto-Lock Session | 30 分钟 | 永不 / 15 / 30 / 60 分钟 / 每次使用后。到期执行等效 Lock 的清空 |
| Trash | 关 | 是否包含回收站条目（`enpass-cli -trashed`） |

## 解锁模式

### Touch ID

解锁时 enpass-cli 弹系统 Touch ID。**注意：弹窗上的"使用密码"按钮不可用**——enpass-cli 采用纯生物识别策略（`LAPolicyDeviceOwnerAuthenticationWithBiometrics`，无设备密码回退、不支持 Apple Watch 批准），只能实际扫描指纹，点"使用密码"只会报错。

**首次使用需在扩展内登记一次**：锁定界面按 **⌘↩** 输入一次 Enpass 主密码（本次不弹指纹）→ enpass-cli 解锁并把派生密钥写入 macOS 登录钥匙串（service=`enpass-cli`，account=镜像路径，见下）→ 之后每次快照只需 Touch ID。主密码仅经当次 spawn 的 `MASTERPW` 环境变量传递，扩展不存储。若指纹连续失败，随时可用 ⌘↩ 走主密码通道。

**每次快照 = 一次 Touch ID**：enpass-cli 的 `-biometric` 模式每次运行都新建 `LAContext` 并调用 `evaluatePolicy`（`LAPolicyDeviceOwnerAuthenticationWithBiometrics`，不支持 Apple Watch 批准、无设备密码兜底、无缓存）。因此本扩展采用"一次 Touch ID 全量快照 + 内存过滤"架构，会话内搜索不再惊动 Touch ID。

### Enpass 主密码（MASTERPW）

进命令即呈现密码表单（作为根屏直接渲染，规避 Tinycast 0.11.12 pushed 表单不自动聚焦的 bug；Esc 退出命令），输完按 **⌘↩** 提交——Tinycast 表单里 ↩ 被文本控件占用，⌘↩ 是表单提交键。主密码仅通过**当次 spawn 的环境变量** `MASTERPW` 传给 enpass-cli：从不出现在命令行参数中，从不持久化，输入框关闭后即离开内存。会话内后续操作走内存快照，不再传密码。Refresh / ⌘R 会重新要求输入。

### 主密码（钥匙串记忆，默认，Alfred 同款）

与 alfred-enpass 相同的体验：首次进命令弹密码表单，**验证成功后**经 `/usr/bin/security` 把主密码存入登录钥匙串（service=`raycast-enpass`，account=保险库路径）；之后每次进 `enp` 静默读取、零提示直达列表。存入的密码若在 Enpass 侧失效（改了主密码），扩展自动删除旧条目并重新询问。`enp-lock` 删除该条目并清空快照，回到首次状态。

## 安全模型

- **内存快照**：解锁时一次 `enpass-cli -vault=<path> -biometric -detailed -json -sort show` 把全部条目（含明文密码、TOTP secret）读入扩展进程内存。快照**只存在于内存**：不写 LocalStorage、不写磁盘、不写日志、不进任何缓存或 recent-items。
- **真实保险库零接触**：enpass-cli 以读写模式打开 SQLite，直接打开真实保险库目录会产生 `-wal`/`-shm` 临时写入，并惊动正在运行的 Enpass（它对"外部改动"的反应是弹出主窗口/自锁）。因此每次快照先把**密文**文件（`vault.enpassdb`、`vault.json` 及 WAL 文件）复制到固定临时目录 `$TMPDIR/raycast-enpass-vault`，enpass-cli 只打开镜像，结束即删——真实保险库目录不发生任何读写。镜像路径固定，因此 Touch ID 登记的钥匙串条目（account=镜像路径）跨会话稳定；在终端里对真实路径做的登记与扩展互不影响。
- **快照生命周期 = 命令会话**（Tinycast 运行时模型）：Tinycast 为每次命令启动创建全新 JSContext，离开命令即整个销毁，模块级状态绝不带入下一次运行。因此**离开搜索界面（回根目录 / 关闭面板 / 启动其他命令）即天然锁定**；自动锁定计时器只在界面长开时才有意义。Lock Vault 命令也正是借此生效——启动它会抢占并销毁搜索命令的上下文。
- **剪贴板**：所有敏感值（密码、TOTP 码、标记敏感的字段）经 `Clipboard.copy(text, { concealed: true })` 复制 —— 剪贴板带 `org.nspasteboard.ConcealedType` 标记，Tinycast 的剪贴板历史轮询器无条件跳过此类内容（ConcealedType / TransientType / com.apple.is-sensitive）。倒计时到时时仅当剪贴板仍持有该值才清除；期间你复制了别的内容则不动。用户名等非敏感值为普通复制（会进剪贴板历史，与 Alfred 版一致）。
- **钥匙串信任模型**：两类条目——enpass-cli 在 Touch ID 模式写入的派生密钥（service=`enpass-cli`），以及钥匙串记忆模式写入的主密码本身（service=`raycast-enpass`）——**都未设置 `kSecAttrAccessControl`**：钥匙串解锁期间，任何以你的用户身份运行的进程都能读取它们（`security` 工具读取零弹窗，已实测）。与"主密码存登录钥匙串"等价，是 alfred-enpass 等密码管理器工作流的通用信任模型，但**不建议在多人共用账户的 Mac 上使用**。另：写入瞬间主密码出现在 `security` 进程的参数列表中（毫秒级）——Apple 的 `security` 工具没有 stdin/env 传入方式，alfred-enpass 承担同样的折衷。
- **MASTERPW 模式**：主密码仅在子进程环境变量中存活不到一秒；期间同用户进程理论上可读该子进程环境。enpass-cli 除交互输入外只有这一种传入方式。
- **链接**：只打开 `http`/`https`；`javascript:`、`file:` 等一律拒绝。
- **进程间通信**：只读 enpass-cli 的 stdout JSON；密码、主密码从不出现在任何 enpass-cli 命令行参数中（唯一例外：钥匙串记忆模式**写入时**经 `security -w`，见上）。
- **无网络**：扩展自身不做任何网络请求；保险库读取完全本地。

## 安装（Tinycast）

已按 [Tinycast 官方文档](https://github.com/abue-ammar/tinycast/blob/main/docs/features/extensions.md) 核实：

1. 安装后端：`brew install enpass-cli`
2. 构建扩展：
   ```sh
   cd raycast-enpass
   npm install
   npm run build   # 产出 dist/：package.json + 三个 <command>.js + assets/
   ```
3. **Settings → Extensions**：打开扩展总开关（默认关闭，开启即同意运行第三方代码）。
4. **Install New → Add from folder** → 选择本项目的 **`dist/` 目录**（不是项目根目录——Tinycast 要的是"manifest + 构建产物"目录）。
5. **Settings → Extensions → Enpass**：在每个命令行上设置 Alias（相当于 Raycast 的 keyword）：`enp` / `enp-lock` / `enp-refresh`；旁边可录全局快捷键。扩展标题 "Enpass" 本身也是所有命令的搜索词。
6. 首次运行 Search Vault 会自动自检：CLI 不存在或保险库目录无 `vault.enpassdb` 时给出明确指引（如 `brew install enpass-cli`、Enpass → Settings → Advanced → Data Location），不会静默失败。

**更新**：folder 安装的扩展不参与自动更新。改动代码后重新 `npm run build`，再 Add from folder 一次即覆盖安装（偏好项保留）。

## 开发

```sh
npm run test        # vitest：快照解析 / TOTP / 路径探测 / 剪贴板倒计时 + 测试保险库集成
npm run typecheck   # tsc --noEmit
npm run build       # ray build -e dist -o dist → dist/
```

测试只针对 enpass-cli 仓库自带的公开测试保险库（`test/fixtures/testvault`，密码 `absolutely-No-clue`），绝不触碰真实保险库。

## 已知限制

- **每次解锁 / 刷新都弹一次 Touch ID**（enpass-cli 无会话缓存），这是设计使然：快照驻留内存换来会话内零打扰。Touch ID 弹窗的"使用密码"按钮不可用（enpass-cli 纯生物识别策略）——密码回退请用锁定界面的 ⌘↩ 主密码通道。
- **会话随命令界面结束**：Tinycast 每次启动命令都销毁旧 JSContext，离开搜索界面即锁定。安全性更强，但意味着"自动锁定 30 分钟"等选项只在界面持续打开时起作用；关闭面板后再进入必须重新解锁。
- **剪贴板倒计时清除只在命令会话存活期间有效**：复制密码后若立即离开命令，JSContext 被销毁，30 秒定时器随之消失，剪贴板将不会被自动清除（内容本身带 concealed 标记，仍不进 Tinycast 剪贴板历史）。需要倒计时保障时请保持界面打开。
- **粘贴动作经过系统剪贴板**（Raycast API 的 `Clipboard.paste` 如此），瞬时内容可能被剪贴板历史捕获；介意请用默认的复制动作（带 concealed 标记）。
- **fn 修饰键依赖 Tinycast 支持**：`@raycast/api` 类型层面不认识 `fn`，扩展以类型断言传入；在原生 Raycast 中 fn↩ 无效。
- **spawn 的 stdin 是一次性的**（Tinycast 运行时限制）：本扩展不走 stdin，主密码经环境变量传入，不受影响。
- TOTP 使用标准 30 秒周期、6 位码（enpass-cli 同样如此）。
- 回收站条目与正常条目同样展示（开启 Trash 时），UI 不做额外区分。

## 真机验收清单

> 用真实保险库验证（全程只读，无任何写操作）。

- [ ] **首次登记**：`enp` → 锁定界面按 ⌘↩ → 输入一次 Enpass 主密码 → 解锁成功（派生密钥写入钥匙串）。
- [ ] **解锁（Touch ID）**：`enp` → ↩ → 系统弹 Touch ID → **扫描指纹**（不要点"使用密码"）→ 列表显示全部条目；同一会话内搜索不再弹 Touch ID。
- [ ] **搜索**：输入关键词能按标题 / 用户名 / 分类 / 网址过滤；列表中无明文密码。
- [ ] **复制密码**：↩ → 粘贴到目标处正确；Tinycast 剪贴板历史中**不出现**该密码。
- [ ] **剪贴板倒计时**：保持命令界面打开，默认 30 秒后剪贴板被清空（粘贴变为旧内容/空）；倒计时内复制其他文本，到时不被清掉。
- [ ] **复制用户名**：⌘↩ → 粘贴正确。
- [ ] **TOTP**：⌥↩ 复制的 6 位码与 Enpass 主程序当前显示的码一致（30 秒窗口内比对）。
- [ ] **打开网站**：⌃↩ 在默认浏览器打开正确网址；对无网址条目该动作不显示。
- [ ] **字段详情**：⇧↩ 进入详情，敏感字段打码；↩ 复制字段、⌘↩ 粘贴字段。
- [ ] **原地刷新**：⌘R → 再验证一次 → 列表重建；在 Enpass 主程序改动某条目标题后 ⌘R 可见新值。
- [ ] **Lock（两种路径）**：① 界面内 ⌘L → 回到解锁界面；② `enp-lock` → HUD 提示已锁定 → 再次 `enp` 需重新验证。直接离开面板（Esc）再进入 `enp`，同样需重新验证。
- [ ] **Refresh**：`enp-refresh` → 重新验证后直接进入搜索列表。
- [ ] **主密码模式**（可选）：偏好切到 MASTERPW → `enp` 弹密码框 → 错误密码有明确报错、正确密码解锁；活动监视器/`ps` 中查不到密码出现在命令行。
- [ ] **钥匙串记忆模式**：偏好切到"Master Password, remembered in Keychain" → `enp` 输一次主密码 → 退出再进 `enp` **零提示直达列表**；`enp-lock` 后再进恢复为密码表单。

## License

MIT。不隶属于 Enpass Technologies；Enpass 是其所有者的商标。
