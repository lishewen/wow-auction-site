#!/usr/bin/env python3
"""解码 Auctionator CBOR 数据 -> 拍卖行 JSON 缓存
用法: python3 decode.py [数据目录]"""
import cbor2, json, os, sys, glob
from datetime import date, timedelta

DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
SCAN_DAY_0 = date(2020, 1, 1)  # Auctionator.Constants.SCAN_DAY_0 (客户端本地时区 UTC+8)

def day_to_date(day):
    d = SCAN_DAY_0 + timedelta(days=day)
    return d.isoformat()

def b2s(v):
    return v.decode("utf-8", "replace") if isinstance(v, bytes) else str(v)

# 物品名称
names = {}
tsv = os.path.join(DATA_DIR, "item_names.tsv")
if os.path.exists(tsv):
    with open(tsv, encoding="utf-8") as f:
        next(f)
        for line in f:
            parts = line.rstrip("\n").split("\t", 1)
            if len(parts) == 2:
                names[parts[0]] = parts[1]

# 合并 webReader 回填的中文名（优先级更高）
import os as _os
cn_file = _os.path.join(DATA_DIR, "item_names_cn.json")
if _os.path.exists(cn_file):
    with open(cn_file, encoding="utf-8") as f:
        names.update(json.load(f))
    print(f"Merged cn names: total {len(names)}")

# 解码各服务器
realms = {}
all_item_ids = set()
for binfile in glob.glob(os.path.join(DATA_DIR, "cbor_*.bin")):
    realm = os.path.basename(binfile)[5:-4]
    with open(binfile, "rb") as f:
        try:
            decoded = cbor2.loads(f.read())
        except Exception as e:
            print(f"decode error {realm}: {e}")
            continue
    items = {}
    for key, value in decoded.items():
        k = b2s(key)
        if k == "version":
            continue
        entry = {}
        for field, fv in value.items():
            fk = b2s(field)
            if isinstance(fv, dict):
                entry[fk] = {b2s(dk): dv for dk, dv in fv.items()}
            else:
                entry[fk] = fv
        items[k] = entry
        all_item_ids.add(k)
    realms[realm] = items
    print(f"{realm}: {len(items)} items")

# 构建输出结构
named = sum(1 for i in all_item_ids if i in names)
print(f"Items total: {len(all_item_ids)}, named: {named}, missing: {len(all_item_ids)-named}")

# 合并每个物品: {id, name, realms: {realm: {m, h, l, a}}}
items_out = {}
for realm, items in realms.items():
    for iid, entry in items.items():
        if iid not in items_out:
            items_out[iid] = {"id": iid, "name": names.get(iid, f"物品#{iid}"), "named": iid in names, "realms": {}}
        items_out[iid]["realms"][realm] = {
            "m": entry.get("m", 0),
            "h": entry.get("h", {}),
            "l": entry.get("l", {}) if isinstance(entry.get("l"), dict) else {},
            "a": entry.get("a", {}),
        }

# 汇总表：当前价(各服务器最小 m)、有名称物品优先
summary = []
for iid, item in items_out.items():
    prices = {r: d["m"] for r, d in item["realms"].items()}
    summary.append({
        "id": iid,
        "name": item["name"],
        "named": item["named"],
        "minPrice": min(prices.values()) if prices else 0,
        "prices": prices,
    })

out = {
    "generatedAt": __import__("time").strftime("%Y-%m-%d %H:%M:%S"),
    "scanDay0": "2020-01-01",
    "realms": {r: len(i) for r, i in realms.items()},
    "items": items_out,
}
with open(os.path.join(DATA_DIR, "auction_data.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

print(f"Saved auction_data.json ({os.path.getsize(os.path.join(DATA_DIR,'auction_data.json'))//1024} KB)")

# 轻量索引（供前端快速加载）：id/name/minPrice/prices
with open(os.path.join(DATA_DIR, "index.json"), "w", encoding="utf-8") as f:
    json.dump({"generatedAt": out["generatedAt"], "realms": out["realms"], "list": summary},
              f, ensure_ascii=False, separators=(",", ":"))
print(f"Saved index.json ({os.path.getsize(os.path.join(DATA_DIR,'index.json'))//1024} KB)")
