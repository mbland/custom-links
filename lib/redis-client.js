'use strict'

module.exports = RedisClient

function RedisClient(client) {
  this.client = client
}

RedisClient.prototype.get = function(url) {
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
    t_.client.lrem(owner, 1, url, function(err) {
      err ? reject(err) : resolve()
    })
  })
}

RedisClient.prototype.create = function(url, location, owner) {
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
      if (err) {
        return reject(new Error('failed to get redirects owned by ' + owner +
          ': ' + err))
      }
      resolve(data)
    })
  })
}

function updateProperty(t_, url, property, value) {
  return new Promise(function(resolve, reject) {
    return t_.get(url)
      .catch(function(err) {
        throw new Error('failed to determine existence of ' + url +
          ' before changing ' + property + ' to ' + value + ': ' + err)
      })
      .then(function(urlData) {
        if (!urlData) {
          throw new Error('no redirection for ' + url + ' exists')
        }
        t_.client.hset(url, property, value, function(err) {
          if (err) {
            reject(new Error('failed to change ' + property + ' for '
              + url + ' to ' + value + ': ' + err))
          }
          resolve(urlData[property])
        })
      })
      .catch(function(err) {
        reject(err)
      })
  })
}

RedisClient.prototype.changeOwner = function(url, newOwner) {
  var t_ = this
  return updateProperty(this, url, 'owner', newOwner)
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
  return updateProperty(this, url, 'location', newLocation)
}

RedisClient.prototype.deleteRedirection = function(url) {
  var t_ = this

  return t_.get(url)
    .then(function(urlData) {
      if (!urlData) {
        throw new Error('failed to delete nonexistent redirection for ' + url)
      }
      return new Promise(function(resolve, reject) {
        t_.client.del(url, function(err) {
          if (err) {
            reject(new Error('failed to delete redirection for ' + url +
              ': ' + err))
          }
          resolve()
        })
      })
      .then(function() {
        return t_.removeUrlFromOwner(urlData.owner, url).catch(function(err) {
          throw new Error('failed to remove ' + url + ' from redirections ' +
            'owned by ' + urlData.owner + ': ' + err)
        })
      })
    })
}
