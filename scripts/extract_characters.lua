#!/usr/bin/env lua
-- 角色背包/银行物品提取（数据源：Syndicator 插件 SavedVariables）
-- 用法: lua extract_characters.lua [输出目录] [SavedVariables目录]
-- 输出: character_items.tsv (character, realm, itemID, itemCount, quality, isBound)

local OUT = arg[1] or "./data"
local SV_DIR = arg[2] or os.getenv("WOW_SV_DIR") or "./SavedVariables"

local f, err = loadfile(SV_DIR .. "/Syndicator.lua")
if not f then print("loadfile error: " .. tostring(err)); os.exit(1) end

local env = setmetatable({}, {__index = _G})
env.SYNDICATOR_DATA = {}
env.SYNDICATOR_CONFIG = {}
if debug.setupvalue then debug.setupvalue(f, 1, env) end

local ok, err = pcall(f)
if not ok then print("exec error: " .. tostring(err)); os.exit(1) end

local data = env.SYNDICATOR_DATA
if not data or not data.Characters then
    print("no SYNDICATOR_DATA.Characters"); os.exit(1)
end

local out = assert(io.open(OUT .. "/character_items.tsv", "w"))
out:write("character\trealm\titemID\titemCount\tquality\tisBound\n")

local function writeItems(name, realm, container)
    if type(container) ~= "table" then return end
    for _, item in ipairs(container) do
        if type(item) == "table" and item.itemID then
            out:write(string.format("%s\t%s\t%d\t%d\t%d\t%s\n",
                name, realm, item.itemID, item.itemCount or 1,
                item.quality or 0, tostring(item.isBound or false)))
        end
    end
end

local count = 0
for charKey, charData in pairs(data.Characters) do
    local name, realm = charKey:match("^(.-)%s*-%s*(.+)$")
    if not name then name, realm = charKey, "unknown" end

    -- 装备的背包
    if charData.containerInfo and charData.containerInfo.bags then
        for _, bag in ipairs(charData.containerInfo.bags) do
            writeItems(name, realm, bag)
        end
    end
    -- 背包物品（按包分组）
    if charData.bags then
        for _, bag in ipairs(charData.bags) do
            if type(bag) == "table" then writeItems(name, realm, bag) end
        end
    end
    -- 银行标签页
    if charData.bankTabs then
        for _, tab in ipairs(charData.bankTabs) do
            if type(tab) == "table" then writeItems(name, realm, tab.slots) end
        end
    end
    count = count + 1
end

out:close()
print(string.format("Extracted characters: %d -> %s/character_items.tsv", count, OUT))
