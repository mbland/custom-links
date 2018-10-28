local owner = KEYS[1]
if redis.call("EXISTS", owner) ~= 1 then
  return "User " .. owner .. " not found"
end

return redis.call("LRANGE", owner, 0, -2)
