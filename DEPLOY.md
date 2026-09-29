# FleetingERP 三端同步与服务器升级

适用现有部署：/path/to/fleetingerp，PM2 应用 fragrance-inventory，Nginx 提供 HTTPS，Node 仅监听 127.0.0.1:3000。路径来自 2026-09-27 核实结果；其他服务器必须另行核实。

## 1. 整理本地版本

- 运行 `npm test`（临时数据库）和 `git diff --check`，审查改动。
- 不提交环境密钥、业务数据库、WAL/SHM、日志、备份、node_modules 或微信私有配置。
- 测试数量以当前版本的实际通过结果为准。小程序源码同步不等于微信版本发布。
- 确认 Node.js >=22，锁文件与 package.json 一致。

## 2. 更新 GitHub

提交经过审查的文件并推送；记录完整提交号作为本次发布目标。服务器获取代码前核对远程地址和工作区。不要使用 reset --hard、强推或清理命令覆盖未知改动。

## 3. 核实数据库并备份

先从应用进程打开的文件确认实际数据库路径，再核对 PM2 应用名、Node/npm 版本及启动脚本。现有 .env.production 优先于 .env，启动环境变量优先于文件；不要覆盖这些配置。

运行中 SQLite 采用 WAL，不能只复制主数据库文件。使用 SQLite backup API 生成一致性副本，并对副本执行 integrity_check，要求结果为 ok。记录副本 SHA256、数据表行数、原提交号和实际数据库路径。环境文件另行备份至仅 root 可读目录，切勿上传 GitHub 或粘贴其内容。

涉及 users、locations 或权限范围变化时，先运行 `python3 scripts/location-preflight.py 实际数据库路径`，核对重复场所、用户绑定与历史引用；保存只读报告。不得根据名称自动合并有历史引用的场所。

进入维护窗口，暂停网页及小程序业务写入。正式切换前再次备份，避免备份之后产生的写入在回滚时丢失。最好先在数据库备份的额外副本上运行新版迁移并检查完整性，不得拿唯一备份做迁移演练。

## 4. 更新服务器代码与依赖

仅在备份确认后操作。以下 RELEASE_COMMIT 由本次 GitHub 推送的完整提交号填写，不能使用未填写的占位符。

```bash
cd /path/to/fleetingerp
# 只读检查，输出必须符合预期
git status --short
git remote -v
node --version
npm --version
# 获取代码，不更新工作区
git fetch origin main
# 核实目标后，将完整提交号填入变量
RELEASE_COMMIT='填写已核实的完整提交号'
git show --no-patch --oneline "$RELEASE_COMMIT"
git merge-base --is-ancestor HEAD "$RELEASE_COMMIT"
```

任一检查失败应停止。备份、维护窗口及回滚条件确认后，再执行：

```bash
pm2 stop fragrance-inventory
# 确认该应用停止、3000 端口释放；不要停止其他应用
ss -lntp
# 做停机后的最终一致性备份，再继续
git merge --ff-only "$RELEASE_COMMIT"
npm ci --omit=dev
npm test
```

不得在旧进程仍运行时替换 node_modules。npm ci 需要联网；better-sqlite3 是原生模块，安装或编译失败时不要启动新服务。测试使用临时数据库，不是业务数据库验收。

## 5. 受控启动、迁移和验收

```bash
pm2 startOrRestart ecosystem.config.js --only fragrance-inventory --update-env
pm2 logs fragrance-inventory --lines 80 --nostream
curl --fail --max-time 10 http://127.0.0.1:3000/api/health
```

应用启动自动执行事务化数据库结构迁移，不需要手工导入 schema.sql，不执行 db/seed.sql，不清空数据库。旧会话失效后重新登录；已有管理员密码保留。只有全新数据库首次生产启动才要求 ADMIN_PASSWORD 至少 12 位，生产环境不初始化示例数据。

完成以下验收后执行 `pm2 save`：

- 进程稳定、无反复重启，仍仅监听 127.0.0.1:3000。
- 确认 Nginx 域名转发，再访问 HTTPS 健康端点及页面，刷新网页资源缓存。
- 重新登录，检查原商品、库存、会员及历史单据可见。
- 用明确标记的测试商品验证入库、出库、销售、库存变化；验证非法数量被拒绝，低权限账号无法越权。测试单据保留审计记录，不直接删库。
- 检查迁移后数据库完整性、外键、表行数和原有记录内容指纹；迁移版本号不能代替数据核对。预期新增字段、索引及触发器不应删除业务记录。
- `/api/health` 验证维护状态和实际表读取，异常返回 503；它不替代完整性检查或业务验收。
- 发布前已打开的商品/SKU 编辑窗口应关闭并刷新，新版保存要求读取时的 revision；409 冲突时保留输入供核对，重新读取后再修改，不自动覆盖。
- 记录服务器提交号、安装的 Express 版本、部署时间与验收结果。

## 回滚

保留旧提交、环境文件和迁移前完整数据库备份。新版启动失败，先停止该应用并保留故障日志；不要只切回旧代码后立即启动，因为数据库可能已迁移。

在所有数据库使用者停止后，将当前数据库及 WAL/SHM 一起移入故障保留目录，再恢复已验证的迁移前副本到原实际路径，恢复权限。切回记录的旧提交，按旧锁文件安装依赖，再启动和验收。若升级后已产生业务写入，回滚备份会丢失这些新写入，必须先确认处理方式。

## 系统与小程序事项

- PM2 守护进程曾显示 node (deleted)。在维护窗口核对实际 Node 版本及全部托管应用，单独安排守护进程更新；不要直接执行可能重启全部应用的操作。
- HTTPS 对外开放；不因本次更新增加公网 3000 放行。SSH Workbench 配置与项目提交独立，保持现有免密登录配置。
- 小程序需单独核实 AppID、HTTPS API 地址和微信合法域名，再上传体验版验收；GitHub 推送不自动发布微信版本。
- 旧的一键部署入口已停用，避免跳过备份或覆盖配置。
