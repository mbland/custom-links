'use strict'

module.exports = RedisClient

function RedisClient(client) {
  this.client = client
}

function expectResult(expected, func) {
  return new Promise((resolve, reject) => {
    func((err, result) => err ? reject(err) : resolve(result === expected))
  })
}

function expectOne(func) {
  return expectResult(1, func)
}

RedisClient.prototype.userExists = function(userId) {
  return expectOne(done => this.client.exists(userId, done))
}

RedisClient.prototype.findOrCreateUser = function(userId) {
  return this.userExists(userId)
    .then(exists => {
      if (exists) {
        return false
      }
      return expectOne(done => this.client.lpush(userId, '', done))
    })
}

RedisClient.prototype.getRedirect = function(url) {
  return new Promise((resolve, reject) => {
    this.client.hgetall(url, (err, urlData) => {
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
  return new Promise((resolve, reject) => {
    this.client.hincrby(url, 'count', 1, err => err ? reject(err) : resolve())
  })
}

RedisClient.prototype.addUrlToOwner = function(owner, url) {
  return new Promise((resolve, reject) => {
    this.client.lpushx(owner, url, (err, result) => {
      err ? reject(err) : resolve(result !== 0)
    })
  })
}

RedisClient.prototype.removeUrlFromOwner = function(owner, url) {
  return expectOne(done => this.client.lrem(owner, 1, url, done))
}

RedisClient.prototype.createRedirect = function(url, location, owner) {
  return new Promise((resolve, reject) => {
    this.client.hsetnx(url, 'owner', owner, (err, result) => {
      if (err) {
        return reject(err)
      } else if (result === 0) {
        return resolve(false)
      }
      this.client.hmset(url, 'location', location, 'count', 0, err => {
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
  return new Promise((resolve, reject) => {
    this.client.lrange(owner, 0, -1, (err, data) => {
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
  return this.getRedirect(url)
    .then(urlData => {
      if (!urlData) {
        return Promise.resolve(false)
      }
      return expectResult(0, done => {
        this.client.hset(url, property, value, done)
      })
    })
}

RedisClient.prototype.deleteRedirection = function(url) {
  return expectOne(done => this.client.del(url, done))
}
