# 将“同频提问局”推送到 GitHub：完整教程

本文以 Windows PowerShell 为例，说明如何把本地项目推送到 GitHub 的公开仓库。项目目录为：

```text
D:\codex-project\同频提问局
```

当前仓库远程地址：

```text
https://github.com/dsad554/tongpintw.git
```

> 本教程只上传 Git 已跟踪的项目文件。Access Secret、OAuth Secret、`.env`、本地用户数据、备份和测试输出都不应上传。

## 一、准备环境

安装以下工具并重新打开 PowerShell：

- Git for Windows：<https://git-scm.com/download/win>
- 一个已登录 GitHub 的账号：`dsad554`

检查 Git：

```powershell
git --version
```

进入项目目录：

```powershell
Set-Location 'D:\codex-project\同频提问局'
```

## 二、推送前安全检查

先查看当前状态、远程地址和提交记录：

```powershell
git status --short
git remote -v
git log --oneline -5
```

检查待上传文件清单：

```powershell
git ls-files
```

确认以下内容不会出现在清单中：

- `node_modules/`
- `交付包/`
- `memory/`
- `备份/`
- `测试输出/`
- `.env`、`.env.*`
- `数据/本地状态.json`
- Access Secret、OAuth Secret、Token、证书和私钥文件

项目根目录的 `.gitignore` 已用于排除这些内容。若新增了敏感文件，先补充 `.gitignore`，再执行 `git add`。

推荐用关键词扫描已跟踪文本文件：

```powershell
$patterns = 'access.?secret|client.?secret|oauth.?secret|api.?key|bearer\s+[A-Za-z0-9._-]+|BEGIN (RSA|OPENSSH|PRIVATE) KEY|\.env'
git grep -n -I -E $patterns -- ':!package-lock.json'
```

命令没有输出才继续。若发现真实密钥，立即从文件中删除并轮换密钥；仅删除工作区文字不足以清除已经提交到 Git 历史中的密钥。

## 三、配置 Git 提交身份

如果执行 `git commit` 时出现：

```text
Please tell me who you are
fatal: unable to auto-detect email address
```

只在当前项目设置提交身份即可，不影响电脑上的其他仓库：

```powershell
Set-Location 'D:\codex-project\同频提问局'
git config user.name 'dsad554'
git config user.email 'dsad554@users.noreply.github.com'
```

检查是否设置成功：

```powershell
git config --local --get user.name
git config --local --get user.email
```

然后重新提交：

```powershell
git add -A
git commit -m '提交同频提问局项目'
```

> GitHub 的 `用户名@users.noreply.github.com` 是公开提交邮箱格式。也可以改成你 GitHub 账号设置中的 noreply 邮箱。
## 三、初始化本地 Git（已经初始化时跳过）

如果项目还没有 `.git` 目录：

```powershell
Set-Location 'D:\codex-project\同频提问局'
git init -b main
git add .gitignore
git commit -m '初始化项目并添加忽略规则'
```

如果项目已经有提交，不要重复 `git init`，直接进入下一步。

## 四、创建 GitHub 公开仓库

### 方法 A：在 GitHub 网页创建（推荐）

1. 登录 <https://github.com>。
2. 点击右上角 **+** → **New repository**。
3. Repository name 填写 `tongpintw`。
4. 选择 **Public**。
5. 不要勾选 **Add a README file**、`.gitignore` 或 License，避免与本地已有文件冲突。
6. 点击 **Create repository**。

如果仓库已经存在，可跳过创建，直接使用它的 HTTPS 地址。

## 五、绑定远程仓库

在项目目录执行：

```powershell
Set-Location 'D:\codex-project\同频提问局'
$remote = 'https://github.com/dsad554/tongpintw.git'

if (git remote get-url origin 2>$null) {
  git remote set-url origin $remote
} else {
  git remote add origin $remote
}

git remote -v
```

输出中应同时看到 fetch 和 push 都指向 `tongpintw.git`。

## 六、提交本地项目

先查看将要加入的文件：

```powershell
git add -A
git status --short
```

确认没有敏感文件后提交：

```powershell
git commit -m '整理同频提问局项目与产品说明'
```

如果提示 `nothing to commit`，说明本地修改已经提交，可直接推送。

### 关于 `next-app/`

`next-app/` 是独立的 Next.js OAuth 项目。只有在你明确希望它成为同一仓库的一部分时，才执行：

```powershell
git add next-app
```

若只上传原“同频提问局”静态项目，请保持它未跟踪，不要误加入本次提交。

## 七、登录 GitHub 并推送

### 方式 A：Git Credential Manager 设备登录

Git for Windows 通常自带 Git Credential Manager：

```powershell
git credential-manager github login --username dsad554 --device
```

命令会显示一次性代码和 <https://github.com/login/device>。在浏览器中登录正确的 GitHub 账号，输入代码并授权，然后回到 PowerShell。

> 授权页面可能显示比单次推送更宽的 GitHub 权限。确认账号、应用名称和权限后再授权；不希望授权时可取消，改用 GitHub Desktop 或个人访问令牌。

### 方式 B：GitHub Desktop

1. 安装并打开 <https://desktop.github.com/>。
2. 登录 `dsad554`。
3. **File → Add local repository**，选择 `D:\codex-project\同频提问局`。
4. 确认变更列表没有密钥和本地数据。
5. 填写提交说明并点击 **Commit to main**。
6. 点击 **Publish repository**，名称填 `tongpintw`，勾选 **Keep this code private** 应保持未勾选。

### 推送命令

```powershell
git push -u origin main
```

成功时会看到类似：

```text
[new branch]      main -> main
branch 'main' set up to track 'origin/main'
```

## 八、推送后验证

命令行验证：

```powershell
git status
git branch -vv
git ls-remote --heads origin
```

网页验证：

1. 打开 <https://github.com/dsad554/tongpintw>。
2. 文件树中应看到 `dist/`、`产品说明计划书/`、`源码/`、`工具/`、`文档/` 等目录。
3. 不应看到 `memory/`、`备份/`、`测试输出/`、`交付包/`、`数据/本地状态.json` 或任何密钥。
4. 点击 **Settings → General**，确认仓库可见性为 **Public**。
5. 点击提交记录，确认最新提交说明和本地提交一致。

## 九、常见问题

### 1. `src refspec main does not match any`

本地还没有提交，执行：

```powershell
git add -A
git commit -m '首次提交项目'
git branch -M main
git push -u origin main
```

### 2. `remote origin already exists`

不要重复添加，改为：

```powershell
git remote set-url origin https://github.com/dsad554/tongpintw.git
git remote -v
```

### 3. `rejected ... fetch first`

远程仓库已有 README 或其他提交。先备份本地状态，再合并：

```powershell
git fetch origin
git merge origin/main --allow-unrelated-histories
```

解决冲突后重新提交并推送：

```powershell
git add -A
git commit -m '合并远程仓库初始提交'
git push -u origin main
```

除非你确定要丢弃远程提交，不要使用 `git push --force`。

### 4. `Authentication failed` 或要求密码

GitHub 已停止使用账号密码进行 Git HTTPS 推送。请重新运行 Git Credential Manager 设备登录、使用 GitHub Desktop，或使用 GitHub 官方个人访问令牌（PAT）。PAT 只输入到 Git 凭据提示中，不要写入脚本、README 或仓库。

### 5. `Could not resolve host`、`Connection timed out`、`Connection was reset`

这是网络连接问题，不是 Git 文件问题。检查网络、代理和防火墙后重试：

```powershell
Test-NetConnection github.com -Port 443
git ls-remote origin
git push -u origin main
```

不要因为网络错误反复创建同名仓库，也不要把密钥粘贴到 URL 中。

### 6. 推送后发现误上传密钥

立即：

1. 在密钥所属服务中撤销并重新生成密钥。
2. 从工作区删除密钥并加入 `.gitignore`。
3. 通知仓库协作者，必要时按 GitHub 官方文档清理历史。
4. 检查 GitHub Secret scanning 的告警。

公开仓库中的密钥应视为已经泄露，即使随后删除文件也不能替代轮换。

### 7. 单个文件过大

GitHub 普通仓库不适合提交大型构建产物、视频或压缩包。删除不需要的文件；确实需要版本管理的大文件再评估 Git LFS。网页发布目录应保持可直接浏览，避免把整个 `node_modules` 或 `交付包` 上传。

## 十、远程仓库内容与本地项目不一致

如果 GitHub 仓库首页出现 `first-website/`、`test-site/`、`test.js` 等与本项目无关的文件，先不要继续执行 `git add`。这通常表示你曾在其他目录执行过推送。

先在本项目确认路径和远程：

```powershell
Set-Location 'D:\codex-project\同频提问局'
(Get-Location).Path
git remote -v
git status -sb
git ls-files | Select-Object -First 20
```

本项目应能看到 `dist/`、`产品说明计划书/`、`源码/`、`工具/` 等路径。确认无误后有两种处理方式：

### 方式 A：保留远程历史并补充正确项目（安全）

适合不确定远程文件是否需要保留的情况：

```powershell
git fetch origin
git merge origin/main --allow-unrelated-histories
```

若 `.gitignore` 发生冲突，保留本项目的忽略规则，然后：

```powershell
git add -A
git commit -m '合并远程历史并补充同频提问局项目'
git push -u origin main
```

### 方式 B：用本地项目替换远程错误内容（需确认）

这会让 GitHub `main` 最终只保留本项目内容，并删除远程页面上的错误文件；旧内容仍可在 Git 历史中查看。由于涉及对外仓库历史和文件删除，建议先在 GitHub 页面确认这些文件确实不需要，再执行：

```powershell
Set-Location 'D:\codex-project\同频提问局'
git fetch origin
git push --force-with-lease -u origin main
```

如果本地分支尚未包含最新项目提交，先执行本教程“提交本地项目”一节，再运行上面的推送命令。不要使用不带 `--with-lease` 的 `--force`。

推送后刷新 <https://github.com/dsad554/tongpintw>，应看到本项目目录结构。若仍不一致，执行 `git ls-tree --name-only origin/main` 检查远程分支，并确认你没有在其他目录操作。
## 十一、日常更新流程

以后修改项目后，在项目目录执行：

```powershell
Set-Location 'D:\codex-project\同频提问局'
git status --short
git add -A
git diff --cached --stat
git commit -m '描述本次修改'
git push
```

每次提交前都检查 `git status --short` 和暂存区内容。发现不应公开的文件时，先取消暂存：

```powershell
git restore --staged -- '文件路径'
```

## 十一、项目公开边界

可公开内容：

- `dist/` 网页项目本体
- `产品说明计划书/`
- `源码/`、`工具/`、`文档/`、`项目总结/`
- `README.md`、`AGENTS.md`、`.gitignore` 和必要的构建配置

不要公开内容：

- Access Secret、OAuth App Secret、Token、密码和证书私钥
- `.env`、`.env.local` 以及本地凭据文件
- `数据/本地状态.json`
- `memory/`、`备份/`、`测试输出/`、`交付包/`
- 未取得公开授权的原始资料或用户个人数据

公开仓库只代表代码可见，不代表知乎 API、OAuth、实时聊天、邮件提醒或云数据库已经自动可用。这些服务仍需单独配置，并应通过部署平台的环境变量或项目外凭据管理提供。


