#!/usr/bin/env lua
-- WoW 拍卖行数据提取
-- 1. Auctionator.lua -> 各服务器 CBOR 二进制
-- 2. 全量扫描 SavedVariables 物品链接 -> 物品ID与中文名 TSV

-- 用法: lua extract.lua [输出目录] [SavedVariables目录]
-- 环境变量: WOW_SV_DIR 也可指定 SavedVariables 目录
local OUT = arg[1] or "./data"
local SV_DIR = arg[2] or os.getenv("WOW_SV_DIR") or "./SavedVariables"

-- ===== Part 1: Auctionator CBOR =====
dofile(SV_DIR .. "/Auctionator.lua")

local realm_count = 0
for realm, data in pairs(AUCTIONATOR_PRICE_DATABASE) do
  if realm ~= "__dbversion" and type(data) == "string" then
    local safe = realm:gsub("[/\\:%s]", "_")
    local f = io.open(OUT .. "/cbor_" .. safe .. ".bin", "wb")
    if f then
      f:write(data)
      f:close()
      realm_count = realm_count + 1
      io.write(string.format("CBOR: %s (%d bytes)\n", realm, #data))
    end
  end
end
io.write("Realms exported: " .. realm_count .. "\n")

-- ===== Part 2: 物品名称扫描 =====
local names = {}

local function scanString(s)
  for id, name in s:gmatch("|Hitem:(%d+):[^|]*|h%[([^%]]+)%]|h") do
    if not names[id] and name ~= "" then
      names[id] = name
    end
  end
end

local function scanTable(t, depth)
  if depth > 12 then return end
  for k, v in pairs(t) do
    local tk, tv = type(k), type(v)
    if tk == "string" then scanString(k)
    elseif tk == "table" then scanTable(k, depth + 1) end
    if tv == "string" then scanString(v)
    elseif tv == "table" then scanTable(v, depth + 1) end
  end
end

-- 安全加载一个 SavedVariables 文件并扫描其全局表
local function scanFile(path)
  local f = io.open(path, "rb")
  if not f then return end
  local size = f:seek("end")
  io.close(f)
  if size == 0 or size > 30 * 1024 * 1024 then return end
  local env = {}
  local chunk = loadfile(path, "t", env)
  if not chunk then return end
  pcall(chunk)
  for _, v in pairs(env) do
    if type(v) == "table" then scanTable(v, 0) end
  end
end

local function countNames()
  local c = 0
  for _ in pairs(names) do c = c + 1 end
  return c
end

-- 优先扫描物品丰富的文件
local priority = {"Syndicator.lua", "Auctionator.lua", "STT.lua", "RareScanner.lua",
  "BossLootTracker.lua", "SavedInstances.lua", "RurutiaSuite_Exporter.lua",
  "TellMeWhen_Options.lua", "DreamForgeTools.lua", "EllesmereUI.lua",
  "AuctionHouseCustomCategories.lua"}
for _, fname in ipairs(priority) do
  scanFile(SV_DIR .. "/" .. fname)
end
io.write("Priority scan names: " .. countNames() .. "\n")

-- 全量扫描（按大小降序，跳过超大文件）
local pfile = io.popen('ls -S "' .. SV_DIR .. '"/*.lua 2>/dev/null')
local files = {}
for line in pfile:lines() do table.insert(files, line) end
pfile:close()

local scanned = 0
for i, path in ipairs(files) do
  scanFile(path)
  scanned = scanned + 1
  if scanned >= 300 then break end
end
io.write("Full scan names: " .. countNames() .. " (" .. scanned .. " files)\n")

-- 保存 TSV
local ids = {}
for id in pairs(names) do table.insert(ids, id) end
table.sort(ids, function(a, b) return tonumber(a) < tonumber(b) end)
local nf = io.open(OUT .. "/item_names.tsv", "w")
nf:write("id\tname\n")
for _, id in ipairs(ids) do
  nf:write(id .. "\t" .. names[id] .. "\n")
end
nf:close()
io.write("Saved item_names.tsv (" .. #ids .. " items)\n")
