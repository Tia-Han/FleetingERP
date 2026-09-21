# FleetingERP - 香氛零售库存管理系统

> 为香氛零售门店设计的轻量级 ERP 系统，聚焦 SKU 库存管理、扫码入库、销售开单与盘点，帮助门店高效运营。

## 项目概览

FleetingERP 是一套面向香氛零售行业的库存管理工具，覆盖从进货入库到销售出库的完整业务链路。系统支持 USB 扫码枪与摄像头扫码识别，可对接外部条码数据库自动获取商品信息，大幅减少人工录入成本。

### 核心特性

- **扫码入库** — 支持 USB 扫码枪 + 摄像头扫码，三级回退策略（本地数据库 → 外部条码API → 手动输入）
- **SKU 管理** — 商品/品牌/品类/规格多层级管理，支持整装与分装 SKU
- **库存流转** — 入库、出库、损耗、分装、调拨全链路库存变动追踪
- **销售开单** — 快速开单、积分抵扣、多种支付方式、小票打印
- **库存盘点** — 实盘数量录入，自动计算差异并调整库存
- **数据安全** — 自动每日备份、一键恢复、XSS 防护、登录限流
- **多端适配** — 响应式布局，手机/平板/电脑均可使用

## 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端 | 原生 HTML + CSS + JavaScript | 无框架依赖，加载快，维护简单 |
| 后端 | Node.js + Express | RESTful API，JSON 通信 |
| 数据库 | SQLite (better-sqlite3) | 嵌入式数据库，零配置，WAL 模式 |
| 认证 | JWT + bcrypt | 无状态认证，密码哈希存储 |
| 进程管理 | PM2 | 自动重启、开机自启、日志管理 |
| 条码识别 | BarcodeDetector API + Canvas 解码 | 原生优先，Canvas 回退 |

## 系统架构图

### 整体架构

```mermaid
graph TB
    subgraph 客户端["客户端（浏览器）"]
        UI["单页应用<br/>HTML + CSS + JS"]
        Scanner["扫码模块<br/>USB扫码枪 / 摄像头"]
        UI --> Scanner
    end

    subgraph 服务端["服务端（Node.js）"]
        Express["Express 服务器<br/>server.js"]
        Auth["JWT 认证中间件<br/>middleware/auth.js"]
        Router["RESTful 路由层<br/>routes/*.js (13个模块)"]
        Express --> Auth --> Router
    end

    subgraph 数据层["数据层"]
        SQLite[("SQLite 数据库<br/>better-sqlite3<br/>WAL模式")]
        Backups["自动备份<br/>db/backups/"]
        SQLite --> Backups
    end

    subgraph 外部服务["外部服务"]
        OBF["Open Beauty Facts API"]
        UPC["UPCitemdb API"]
    end

    UI -->|"HTTP/HTTPS<br/>RESTful JSON"| Express
    Scanner -->|"条码字符串"| Router
    Router --> SQLite
    Router -->|"条码查询<br/>Promise.allSettled"| OBF
    Router -->|"条码查询<br/>Promise.allSettled"| UPC
    Router -->|"备份/恢复"| Backups

    style 客户端 fill:#e3f2fd,stroke:#1565c0
    style 服务端 fill:#fff3e0,stroke:#e65100
    style 数据层 fill:#e8f5e9,stroke:#2e7d32
    style 外部服务 fill:#fce4ec,stroke:#c62828
```

### 业务流程图

```mermaid
flowchart LR
    subgraph 采购入库
        A1["扫码/搜索商品"] --> A2["录入数量+成本"] --> A3["创建入库单"]
    end

    subgraph 库存管理
        B1["库存查询"] --> B2["变动流水"]
        B3["库存盘点"] --> B4["自动调整差异"]
        B5["库存调拨"] --> B6["场所间转移"]
        B7["分装操作"] --> B8["整装→分装SKU"]
    end

    subgraph 销售出库
        C1["选商品+客户"] --> C2["积分抵扣"] --> C3["确认收款"]
        C4["出库/损耗登记"] --> C5["扣减库存"]
    end

    A3 --> B1
    B4 --> B2
    B6 --> B2
    B8 --> B2
    C3 --> B2
    C5 --> B2

    style 采购入库 fill:#e3f2fd,stroke:#1565c0
    style 库存管理 fill:#fff3e0,stroke:#e65100
    style 销售出库 fill:#e8f5e9,stroke:#2e7d32
```

## 项目结构

```
FleetingERP/
├── server.js                 # 应用入口，Express 服务器启动
├── package.json              # 依赖与脚本
├── ecosystem.config.js       # PM2 进程管理配置
├── .env.example              # 环境变量模板
├── deploy.sh                 # 一键部署脚本
├── DEPLOY.md                 # 部署指南
│
├── middleware/
│   └── auth.js               # JWT 认证中间件
│
├── routes/                   # 后端 API 路由
│   ├── auth.js               #   认证/用户管理
│   ├── brands.js             #   品牌管理
│   ├── products.js           #   商品/品类/SKU管理
│   ├── skus.js               #   条码查询与外部API对接
│   ├── locations.js          #   仓库/门店管理
│   ├── stock.js              #   库存查询/变动/盘点
│   ├── stockIn.js            #   入库
│   ├── stockOut.js           #   出库/损耗
│   ├── split.js              #   分装操作
│   ├── transfer.js           #   库存调拨
│   ├── sales.js              #   销售开单/历史
│   ├── customers.js          #   客户/积分管理
│   └── system.js             #   Dashboard/备份/恢复
│
├── utils/
│   ├── db.js                 # SQLite 初始化/迁移/自动备份
│   └── barcode.js            # 外部条码API (OpenBeautyFacts/UPCitemdb)
│
├── db/
│   ├── schema.sql            # 数据库表结构定义
│   └── seed.sql              # 初始示例数据
│
├── public/                   # 前端静态资源
│   ├── index.html            #   单页应用入口
│   ├── css/
│   │   └── style.css         #   全局样式 (响应式)
│   └── js/
│       ├── app.js            #   应用主体 (路由/导航/全局逻辑)
│       ├── api.js            #   API 请求封装
│       ├── pages/            #   功能页面模块
│       │   ├── dashboard.js      #   首页仪表盘
│       │   ├── stockIn.js        #   入库 (扫码入库)
│       │   ├── stockOut.js       #   出库/损耗登记
│       │   ├── split.js          #   分装操作
│       │   ├── transfer.js       #   库存调拨
│       │   ├── stockQuery.js     #   库存查询
│       │   ├── movements.js      #   变动流水
│       │   ├── inventoryCheck.js #   库存盘点
│       │   ├── sales.js          #   销售开单+历史+小票
│       │   ├── customers.js      #   客户管理
│       │   ├── products.js       #   商品/品牌/品类管理
│       │   └── settings.js       #   系统设置/用户/备份
│       └── utils/            #   前端工具库
│           ├── scanner.js        #   扫码枪+相机扫码核心
│           ├── barcodeReader.js  #   Canvas 条码解码
│           ├── searchSuggest.js  #   搜索建议下拉
│           └── formatter.js      #   格式化/XSS转义
│
└── logs/                     # 运行日志 (PM2生成)
```

## 数据模型

系统包含 13 张核心数据表，ER 关系如下：

```mermaid
erDiagram
    brands ||--o{ products : "1:n"
    products ||--o{ skus : "1:n"
    products }o--o| categories : "属于"

    locations ||--o{ stock_balances : "持有"
    skus ||--o{ stock_balances : "存在于"
    locations ||--o{ stock_movements : "记录"
    skus ||--o{ stock_movements : "变动"

    locations ||--o{ stock_in_orders : "入库至"
    stock_in_orders ||--o{ stock_in_items : "包含"
    skus ||--o{ stock_in_items : "入库商品"

    locations ||--o{ sales : "销售于"
    customers ||--o{ sales : "购买"
    sales ||--o{ sale_items : "包含"
    skus ||--o{ sale_items : "销售商品"
    sales ||--o{ payments : "支付"

    locations ||--o{ transfers : "发出/接收"
    transfers ||--o{ transfer_items : "包含"
    skus ||--o{ transfer_items : "调拨商品"

    locations ||--o{ split_orders : "分装于"
    skus ||--o{ split_orders : "源商品"
    split_orders ||--o{ split_items : "产出"
    skus ||--o{ split_items : "分装产物"

    users {
        int id PK
        text username UK
        text password_hash
        text role
        text name
    }
    brands {
        int id PK
        text name
        int is_deleted
    }
    products {
        int id PK
        int brand_id FK
        text name
        text category
        int is_splittable
    }
    skus {
        int id PK
        int product_id FK
        text sku_code UK
        text barcode
        text spec_type
        text volume
        real cost_price
        real retail_price
        int low_stock_threshold
    }
    locations {
        int id PK
        text name
        text type
        text address
    }
    stock_balances {
        int location_id FK
        int sku_id FK
        int quantity
    }
    stock_movements {
        int id PK
        int location_id FK
        int sku_id FK
        text movement_type
        int quantity
        text operator
    }
    customers {
        int id PK
        text wechat_name
        text phone
        int points
        real total_spent
    }
    sales {
        int id PK
        int location_id FK
        int customer_id FK
        real total_amount
        real discount
        real final_amount
        int points_earned
        int points_used
    }
```

### 库存变动类型

| 类型 | 标识 | 说明 |
|------|------|------|
| 入库 | `in` | 采购入库 |
| 出库 | `out` | 手动出库 |
| 销售 | `sale` | 销售出库 |
| 分装 | `split` | 整装拆分为分装 |
| 调入 | `transfer_in` | 调拨接收 |
| 调出 | `transfer_out` | 调拨发出 |
| 损耗 | `loss` | 损耗登记 |
| 盘盈 | `check_in` | 盘点调整(增加) |
| 盘亏 | `check_out` | 盘点调整(减少) |

## API 接口一览

| 模块 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 认证 | POST | `/api/auth/login` | 登录 |
| | PUT | `/api/auth/change-password` | 修改密码 |
| | GET | `/api/auth/me` | 获取当前用户 |
| | GET/POST/DELETE | `/api/auth/users` | 用户管理 |
| 品牌 | GET/POST/PUT/DELETE | `/api/brands` | 品牌 CRUD |
| 商品 | GET/POST/PUT/DELETE | `/api/products` | 商品 CRUD |
| | POST | `/api/products/:id/skus` | 添加 SKU |
| | GET/POST/DELETE | `/api/products/categories` | 品类管理 |
| 条码 | GET | `/api/skus/barcode/:code` | 本地条码查询 |
| | GET | `/api/skus/barcode/lookup/:code` | 外部条码查询 |
| 场所 | GET/POST/PUT/DELETE | `/api/locations` | 仓库/门店 CRUD |
| 库存 | GET | `/api/stock/balances` | 库存余额 |
| | GET | `/api/stock/movements` | 变动流水 |
| | GET | `/api/stock/alerts` | 库存预警 |
| | POST | `/api/stock/check` | 盘点 |
| 入库 | POST | `/api/stock-in` | 创建入库单 |
| 出库 | POST | `/api/stock-out` | 创建出库单 |
| | POST | `/api/stock-out/batch` | 批量出库 |
| 分装 | POST | `/api/split` | 创建分装单 |
| 调拨 | GET/POST | `/api/transfer` | 调拨管理 |
| 销售 | POST | `/api/sales` | 创建销售单 |
| | GET | `/api/sales` | 销售历史 |
| | GET | `/api/sales/:id` | 销售详情 |
| 客户 | GET/POST/PUT/DELETE | `/api/customers` | 客户 CRUD |
| | GET | `/api/customers/:id/purchases` | 客户购买记录 |
| 系统 | GET | `/api/system/dashboard` | 仪表盘数据 |
| | GET | `/api/system/backup` | 手动备份 |
| | GET | `/api/system/export-excel` | 导出Excel |
| | GET | `/api/system/backups` | 备份列表 |
| | POST | `/api/system/restore` | 数据恢复 |

## 快速开始

### 环境要求

- Node.js 18+
- npm 9+

### 本地开发

```bash
# 克隆仓库
git clone git@github.com:Tia-Han/FleetingERP.git
cd FleetingERP

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 浏览器访问
open http://localhost:3000
```

默认账号: `admin` / `admin123`（首次登录后请修改密码）

### 生产部署

详见 [DEPLOY.md](./DEPLOY.md)，支持 PM2 + 阿里云 ECS 一键部署。

```bash
# 服务器上一键部署
bash deploy.sh
```

## 扫码链路架构

系统最重要的功能是扫码入库，完整链路如下：

```mermaid
flowchart TD
    Start(["扫码触发"]) --> InputType{输入方式}

    InputType -->|"USB扫码枪"| USB["keydown事件监听<br/>80ms间隔缓冲<br/>≥4字符 + Enter触发"]
    InputType -->|"摄像头"| Cam["getUserMedia 启动相机"]
    InputType -->|"手动输入"| Manual["手动输入条码<br/>兜底方案"]

    Cam --> Detect{检测方式}
    Detect -->|"BarcodeDetector<br/>可用"| Native["原生API检测"]
    Detect -->|"不可用"| Canvas["Canvas 解码回退"]
    Native --> Frame["每250ms检测一帧"]
    Canvas --> Frame
    Frame --> Confirm{"连续2帧<br/>识别同一条码?"}
    Confirm -->|"是"| Success("扫码成功")
    Confirm -->|"1.5s宽限期内<br/>继续等待"| Frame

    USB --> Success
    Manual --> Success

    Success --> Callback["callback(code)<br/>→ onBarcodeScan(code)"]
    Callback --> Handle["App.handleBarcodeScan(code, onFound)"]
    Handle --> Local{本地数据库<br/>查询条码}

    Local -->|"找到"| Found["onFound(sku)<br/>→ addItem(sku)"]
    Local -->|"未找到"| External["外部API并行查询<br/>Promise.allSettled"]

    External --> ExtResult{查询结果}
    ExtResult -->|"Open Beauty Facts<br/>或 UPCitemdb 找到"| Popup["弹窗显示商品信息<br/>用户确认创建商品"]
    ExtResult -->|"均未找到"| NotFound["提示未找到<br/>引导前往商品管理"]

    Popup --> Found
    Found --> Flow{业务流程}
    Flow -->|"入库"| StockIn["StockInPage.addItem()"]
    Flow -->|"销售"| Sales["SalesPage.addItem()"]
    Flow -->|"出库"| StockOut["StockOutPage.addItem()"]
    Flow -->|"分装"| Split["SplitPage.setSource()"]

    style Start fill:#e3f2fd,stroke:#1565c0
    style Success fill:#e8f5e9,stroke:#2e7d32
    style NotFound fill:#ffebee,stroke:#c62828
    style Found fill:#e8f5e9,stroke:#2e7d32
```

### 扫码稳定性保障

- 相机检测使用 `_detectionStarted` 标志防止双重初始化
- `_scanCompleted` 标志确保同一商品不会被重复添加
- 1.5秒宽限期防止条码漏检导致计数重置
- `stopCamera()` 完整清理 video.srcObject 和 MediaStream tracks
- 外部 API 使用 `Promise.allSettled` 并行查询，最长等待 8 秒

## 角色权限

| 角色 | 标识 | 权限 |
|------|------|------|
| 管理员 | `admin` | 全部功能 + 用户管理 |
| 仓库管理员 | `warehouse_manager` | 入库/出库/分装/调拨/盘点/库存查询 |
| 店员 | `store_clerk` | 销售/客户/库存查询/变动流水 |

## License

[MIT](./LICENSE)
