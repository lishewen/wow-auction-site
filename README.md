# WoW Auction Site ⚔

魔兽世界**正式服**拍卖行数据看板 —— 基于 [Auctionator](https://www.curseforge.com/wow/addons/auctionator) 插件本地缓存，零依赖纯静态前端，Docker 一键部署。

## 功能

- 🔍 物品搜索（中文名 / 物品ID）
- 🌍 多服务器价格对比（当前最低价、各服务器明细）
- 💰 金币格式化显示（金/银/铜）+ 21 天价格区间走势图（内联 SVG，无外部依赖）
- 🎒 角色物品估值（基于 Syndicator 背包/银行数据 × 拍卖行价格，可选）
- 🐳 Docker 独立运行，数据目录挂载即生效

## 工作原理

```
Auctionator.lua (SavedVariables)          Syndicator.lua (SavedVariables)
        │  CBOR (RFC 7049) 编码                   │  Lua 表
        ▼                                        ▼
  scripts/extract.lua                     scripts/extract_characters.lua
        │  导出 cbor_*.bin + item_names.tsv       │  导出 character_items.tsv
        ▼                                        ▼
  scripts/decode.py  ────────────►  data/auction_data.json / index.json
                                                 │
                                          scripts/character_value.py (可选)
                                                 ▼
                       site/ (纯静态页面) ◄── http://localhost:8899
```

Auctionator 把拍卖行价格数据库以 **CBOR 二进制串** 存在 \`AUCTIONATOR_PRICE_DATABASE\` 里，本项目的 Lua 脚本负责导出，Python (cbor2) 负责解码成 JSON。

## 快速开始

### Docker（推荐）

```bash
git clone https://github.com/lishewen/wow-auction-site.git
cd wow-auction-site
# 先把数据放进 data/（见下文"数据源配置"）
docker-compose up -d --build
# 打开 http://localhost:8899/site/index.html
```

### 裸跑

```bash
python3 -m http.server 8899
# 打开 http://localhost:8899/site/index.html
```

## 数据源配置

### 1. 安装游戏插件

| 插件 | 用途 | 必需 |
|------|------|------|
| [Auctionator](https://www.curseforge.com/wow/addons/auctionator) | 拍卖行价格数据库（打开一次拍卖行让它扫描） | ✅ |
| [Syndicator](https://www.curseforge.com/wow/addons/syndicator) | 角色背包/银行物品快照（用于估值） | 可选 |

插件数据在角色**退出游戏/重载界面**后写入 SavedVariables。

### 2. 找到你的 SavedVariables 目录

- **Windows**: `<游戏目录>\_retail_\WTF\Account\<账号ID>\SavedVariables\`
- **macOS**: `/Applications/World of Warcraft/_retail_/WTF/Account/<账号ID>/SavedVariables/`

确认目录下存在 `Auctionator.lua`（用了 Syndicator 则还有 `Syndicator.lua`）。

### 3. 运行提取管线

依赖：Lua 5.4+（`brew install lua`）、Python 3.9+（`pip install cbor2`）

```bash
# 方式一：命令行参数 [输出目录] [SavedVariables目录]
lua scripts/extract.lua ./data "D:/World of Warcraft/_retail_/WTF/Account/12345678#1/SavedVariables"
lua scripts/extract_characters.lua ./data "D:/World of Warcraft/_retail_/WTF/Account/12345678#1/SavedVariables"  # 可选

# 方式二：环境变量
export WOW_SV_DIR="D:/World of Warcraft/_retail_/WTF/Account/12345678#1/SavedVariables"
lua scripts/extract.lua ./data

# 解码成站点 JSON
python3 scripts/decode.py ./data

# 角色物品估值（可选，需要 character_items.tsv）
python3 scripts/character_value.py
```

完成后 `data/` 下会生成：

- `auction_data.json` / `index.json` —— 站点主数据
- `item_names.tsv` —— 从全量 SavedVariables 扫出的物品中文名
- `character_value.json` —— 角色估值（可选）

### 4. 物品中文名补充

物品名主要来自本机 SavedVariables 里的物品链接扫描，覆盖不全时可在 `data/item_names_cn.json` 手动补充：

```json
{ "21841": "灵纹布包", "2589": "亚麻布" }
```

重新运行 `decode.py` 即会合并。

### 5. 每日自动更新（可选 crontab）

```cron
35 6 * * * cd /path/to/wow-auction-site && lua scripts/extract.lua ./data "$WOW_SV_DIR" && python3 scripts/decode.py ./data
```

数据目录是 Docker 只读挂载，更新 `data/` 里的文件后刷新页面即生效，无需重建镜像（改动 site/ 页面才需要 `--build`）。

## ⚠️ 数据隐私

`data/` 下的文件包含你的**角色名、服务器、金币与物品数据**，已在 `.gitignore` 中排除——请勿上传到公开仓库。

## License

[MIT](LICENSE)
