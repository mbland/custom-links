'use strict'

module.exports = RedisClient

function RedisClient(client) {
  this.client = client
}

function checkResultEquals(resolve, reject, expected) {
  return function(err, result) {
    err ? reject(err) : resolve(result === expected)
  }
}

RedisClient.prototype.userExists = function(userId) {
  var t_ = this
  return new Promise(function(resolve, reject) {
    t_.client.exists(userId, checkResultEquals(resolve, reject, 1))
  })
}

RedisClient.prototype.findOrCreateUser = function(userId) {
  var t_ = this

  return t_.userExists(userId)
    .then(function(exists) {
      if (exists) {
        return false
      }
      return new Promise(function(resolve, reject) {
        t_.client.lpush(userId, '', checkResultEquals(resolve, reject, 1))
      })
    })
}

RedisClient.prototype.getRedirect = function(url) {
  var t_ = this

  return new Promise(function(resolve, reject) {
    t_.client.hgetall(url, function(err, urlData) {
      if (err) {
        return reject(err)
      } else if (urlData && urlData.count) {
        urlData.count = parseInt(urlData.count)
      }
      resolve(urlData)
    })
  })
}

RedisClient.prototype.recordAccess = function(url) {
  var t_ = this

  return new Promise(function(resolve, reject) {
    t_.client.hincrby(url, 'count', 1, function(err) {
      err ? reject(err) : resolve()
    })
  })
}

RedisClient.prototype.addUrlToOwner = function(owner, url) {
  var t_ = this

  return new Promise(function(resolve, reject) {
    t_.client.lpushx(owner, url, function(err, result) {
      err ? reject(err) : resolve(result !== 0)
    })
  })
}

RedisClient.prototype.removeUrlFromOwner = function(owner, url) {
  var t_ = this
  return new Promise(function(resolve, reject) {
    t_.client.lrem(owner, 1, url, checkResultEquals(resolve, reject, 1))
  })
}

RedisClient.prototype.createRedirect = function(url, location, owner) {
  var t_ = this

  return new Promise(function(resolve, reject) {
    t_.client.hsetnx(url, 'owner', owner, function(err, result) {
      if (err) {
        return reject(err)
      } else if (result === 0) {
        return resolve(false)
      }
      t_.client.hmset(url, 'location', location, 'count', 0, function(err) {
        if (err) {
          return reject(new Error('redirection created for ' + url +
            ', but failed to set location and count: ' + err))
        }
        resolve(true)
      })
    })
  })
}

RedisClient.prototype.getOwnedRedirects = function(owner) {
  var t_ = this

  return new Promise(function(resolve, reject) {
    t_.client.lrange(owner, 0, -1, function(err, data) {
      if (err) {
        return reject(err)
      }
      // Since the model is that users are created with the empty string as the
      // first list element, pop that before returning URLs.
      data.pop()
      resolve(data)
    })
  })
}

RedisClient.prototype.updateProperty = function(url, property, value) {
  var t_ = this

  return t_.getRedirect(url)
    .then(function(urlData) {
      if (!urlData) {
        return Promise.resolve(false)
      }
      return new Promise(function(resolve, reject) {
        t_.client.hset(url, property, value,
          checkResultEquals(resolve, reject, 0))
      })
    })
}

RedisClient.prototype.deleteRedirection = function(url) {
  var t_ = this
  return new Promise(function(resolve, reject) {
    t_.client.del(url, checkResultEquals(resolve, reject, 1))
  })
}
