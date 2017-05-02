'use strict'

module.exports = RedisClient

function RedisClient(client) {
  this.client = client
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
    t_.client.lpush(owner, url, function(err) {
      err ? reject(err) : resolve()
    })
  })
}

function expectZeroResult(resolve, reject, errMsg) {
  return function(err, reply) {
    if (err) {
      return reject(err)
    } else if (reply === 0) {
      return reject(new Error(errMsg))
    }
    resolve()
  }
}

RedisClient.prototype.removeUrlFromOwner = function(owner, url) {
  var t_ = this

  return new Promise(function(resolve, reject) {
    t_.client.lrem(owner, 1, url,
      expectZeroResult(resolve, reject,
        'owner ' + owner + ' didn\'t own ' + url))
  })
}

RedisClient.prototype.createRedirect = function(url, location, owner) {
  var t_ = this

  return new Promise(
    function(resolve, reject) {
      t_.client.hsetnx(url, 'owner', owner,
        expectZeroResult(resolve, reject,
          'redirection already exists for ' + url))
    })
    .then(function() {
      t_.client.hmset(url, 'location', location, 'count', 0, function(err) {
        if (err) {
          throw new Error('redirection created for ' + url +
            ', but failed to set location and count: ' + err)
        }
      })
    })
}

RedisClient.prototype.getOwnedRedirects = function(owner) {
  var t_ = this

  return new Promise(function(resolve, reject) {
    t_.client.lrange(owner, 0, -1, function(err, data) {
      err ? reject(err) : resolve(data)
    })
  })
}

RedisClient.prototype.updateProperty = function(url, property, value) {
  var t_ = this

  return t_.getRedirect(url)
    .then(function(urlData) {
      if (!urlData) {
        throw new Error('no redirection for ' + url + ' exists')
      }
      return new Promise(function(resolve, reject) {
        t_.client.hset(url, property, value, function(err) {
          err ? reject(err) : resolve(urlData[property])
        })
      })
    })
}

RedisClient.prototype.deleteRedirection = function(url) {
  var t_ = this

  return new Promise(function(resolve, reject) {
    t_.client.del(url,
      expectZeroResult(resolve, reject, 'no redirection exists for ' + url))
  })
}
