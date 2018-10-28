local owner = KEYS[1]
local links = ARGV

if redis.call("EXISTS", owner) ~= 1 then
  return "User " .. owner .. " not found"
end

for i=1,table.getn(links) do
  local link = links[i]

  if redis.call("EXISTS", link) ~= 1 then
    return "Link not found: " .. link
  end
end

for i=1,table.getn(links) do
  local link = links[i]
  local oldOwner = redis.call("HGET", link, "owner")

  redis.call("HSET", link, "owner", owner)
  redis.call("LPUSH", owner, link)
  redis.call("LREM", oldOwner, 1, link)

end
