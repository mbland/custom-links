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

RedisClient.prototype.removeUrlFromOwner = function(owner, url) {
  var t_ = this

  return new Promise(function(resolve, reject) {
    t_.client.lrem(owner, 1, url, function(err, numRemoved) {
      if (err) {
        return reject(err)
      } else if (numRemoved === 0) {
        return reject(new Error('owner ' + owner + ' didn\'t own ' + url))
      }
      resolve()
    })
  })
}

RedisClient.prototype.createRedirect = function(url, location, owner) {
  var t_ = this

  return new Promise(
    function(resolve, reject) {
      t_.client.hsetnx(url, 'owner', owner, function(err, reply) {
        if (err) {
          return reject(err)
        } else if (reply === 0) {
          return reject(new Error('redirection already exists for ' + url))
        }
        resolve()
      })
    })
    .then(function() {
      t_.client.hmset(url, 'location', location, 'count', 0, function(err) {
        if (err) {
          throw new Error('redirection created for ' + url +
            ', but failed to set location and count: ' + err)
        }
      })
    })
    .then(function() {
      return t_.addUrlToOwner(owner, url).catch(function(err) {
        throw new Error('redirection created for ' + url +
          ', but failed to add to list for user ' + owner + ': ' + err)
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

  return new Promise(function(resolve, reject) {
    return t_.getRedirect(url)
      .then(function(urlData) {
        if (!urlData) {
          throw new Error('no redirection for ' + url + ' exists')
        }
        t_.client.hset(url, property, value, function(err) {
          err ? reject(err) : resolve(urlData[property])
        })
      })
      .catch(function(err) {
        reject(err)
      })
  })
}

RedisClient.prototype.changeOwner = function(url, newOwner) {
  var t_ = this

  return t_.updateProperty(url, 'owner', newOwner)
    .then(function(oldOwner) {
      var errPrefix = 'changed ownership of ' + url + ' from ' + oldOwner +
            ' to ' + newOwner + ', but failed to '

      return Promise.all([
        t_.addUrlToOwner(newOwner, url).catch(function(err) {
          throw new Error(errPrefix + 'add it to new owner\'s list: ' + err)
        }),
        t_.removeUrlFromOwner(oldOwner, url).catch(function(err) {
          throw new Error(errPrefix + 'remove it from previous ' +
            'owner\'s list: ' + err)
        })
      ])
    })
}

RedisClient.prototype.updateLocation = function(url, newLocation) {
  var t_ = this

  return t_.updateProperty(url, 'location', newLocation)
}

RedisClient.prototype.deleteRedirection = function(url) {
  var t_ = this

  return new Promise(function(resolve, reject) {
    t_.client.del(url, function(err, numDeleted) {
      if (err) {
        return reject(err)
      } else if (numDeleted === 0) {
        return reject(new Error('no redirection exists for ' + url))
      }
      resolve()
    })
  })
}
