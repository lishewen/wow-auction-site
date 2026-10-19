#!/usr/bin/env python3
"""
角色物品估值脚本
- 读取 character_items.tsv（角色背包/银行物品）
- 读取 auction_data.json（拍卖行最低价）
- 输出每个角色的物品总价值
"""
import json, csv, sys
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).parent.parent
DATA_DIR = BASE / "data"

def load_auction_data():
    """加载拍卖行数据，返回 {itemID: {realm: min_price}}"""
    with open(DATA_DIR / "auction_data.json") as f:
        data = json.load(f)
    
    prices = {}
    for item_id, item_data in data["items"].items():
        prices[item_id] = {}
        for realm, realm_data in item_data.get("realms", {}).items():
            if "m" in realm_data and realm_data["m"]:
                prices[item_id][realm] = realm_data["m"]
    
    return prices, data["items"]

def load_character_items():
    """加载角色物品数据"""
    items = []
    with open(DATA_DIR / "character_items.tsv") as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            items.append({
                'character': row['character'],
                'realm': row['realm'],
                'itemID': int(row['itemID']),
                'itemCount': int(row['itemCount']),
                'quality': int(row['quality']),
                'isBound': row['isBound'] == 'true'
            })
    return items

def calculate_value():
    """计算每个角色的物品价值"""
    prices, item_info = load_auction_data()
    char_items = load_character_items()
    
    # 按角色分组
    char_value = defaultdict(lambda: {'total': 0, 'items': [], 'realm': None})
    
    for item in char_items:
        char_key = f"{item['character']}-{item['realm']}"
        char_value[char_key]['realm'] = item['realm']
        
        item_id = str(item['itemID'])
        item_count = item['itemCount']
        
        # 绑定物品不计价
        if item['isBound']:
            char_value[char_key]['items'].append({
                'itemID': item_id,
                'count': item_count,
                'price': 0,
                'value': 0,
                'name': item_info.get(item_id, {}).get('name', f'Item:{item_id}'),
                'bound': True
            })
            continue
        
        # 查找拍卖行价格
        if item_id in prices:
            # 优先用同服务器价格，否则用最低价
            realm_prices = prices[item_id]
            price = realm_prices.get(item['realm'])
            if not price:
                # 用所有服务器的最低价
                price = min(realm_prices.values()) if realm_prices else 0
            
            value = price * item_count
            char_value[char_key]['total'] += value
            
            char_value[char_key]['items'].append({
                'itemID': item_id,
                'count': item_count,
                'price': price,
                'value': value,
                'name': item_info.get(item_id, {}).get('name', f'Item:{item_id}'),
                'bound': False
            })
    
    return char_value

def format_gold(copper):
    """格式化金币显示"""
    if copper == 0:
        return "0铜"
    gold = copper // 10000
    silver = (copper % 10000) // 100
    copper_rem = copper % 100
    
    parts = []
    if gold > 0:
        parts.append(f"{gold}金")
    if silver > 0:
        parts.append(f"{silver}银")
    if copper_rem > 0:
        parts.append(f"{copper_rem}铜")
    
    return "".join(parts)

def main():
    char_value = calculate_value()
    
    # 输出总览
    print("=" * 60)
    print("角色物品价值估值")
    print("=" * 60)
    
    total_all = 0
    for char_key, data in sorted(char_value.items(), key=lambda x: x[1]['total'], reverse=True):
        realm = data['realm']
        total = data['total']
        total_all += total
        
        # 统计有价格的物品
        valued_items = [i for i in data['items'] if i['value'] > 0]
        bound_items = [i for i in data['items'] if i['bound']]
        
        print(f"\n{char_key} ({realm})")
        print(f"  总价值: {format_gold(total)}")
        print(f"  有价物品: {len(valued_items)} 件")
        print(f"  绑定物品: {len(bound_items)} 件（不计价）")
        
        # 显示前 5 件最贵物品
        if valued_items:
            top_items = sorted(valued_items, key=lambda x: x['value'], reverse=True)[:5]
            print(f"  最贵物品:")
            for item in top_items:
                print(f"    - {item['name']} x{item['count']}: {format_gold(item['value'])} ({format_gold(item['price'])}/个)")
    
    print("\n" + "=" * 60)
    print(f"所有角色总价值: {format_gold(total_all)}")
    print("=" * 60)
    
    # 输出 JSON 供其他脚本使用
    output = {
        'characters': {},
        'total': total_all
    }
    for char_key, data in char_value.items():
        output['characters'][char_key] = {
            'realm': data['realm'],
            'total': data['total'],
            'total_formatted': format_gold(data['total']),
            'item_count': len(data['items']),
            'valued_count': len([i for i in data['items'] if i['value'] > 0]),
            'bound_count': len([i for i in data['items'] if i['bound']])
        }
    
    with open(DATA_DIR / "character_value.json", 'w') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n详细数据已保存到: {DATA_DIR / 'character_value.json'}")

if __name__ == '__main__':
    main()
