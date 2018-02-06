'use strict'

module.exports = RedisClient

function RedisClient(client, getTimestamp) {
  this.client = client
  this.getTimestamp = getTimestamp || (() => new Date().getTime())
}

class SearchHelper {
  constructor(redisClient, searchString) {
    this.links = []
    this.redisClient = redisClient
    this.cursor = 0
    this.regExp = '/*' + (searchString ? searchString + '*' : '')
  }

  collectResults([cursorNext, results]) {
    this.links.push(...results)
    this.cursor = parseInt(cursorNext)
    return this.cursor ? this.scan() : Promise.resolve(this.links)
  }

  processResults(resolve, reject) {
    this.redisClient.client.scan(this.cursor, 'match', this.regExp,
      (err, results) => err ? reject(err) : resolve(results))
  }

  scan() {
    return new Promise((resolve, reject) => {
      this.processResults(resolve, reject)
    }).then(results => this.collectResults(results))
  }

  getLinks() {
    return this.scan().then(links => this.redisClient.fetchLinks(links))
  }
}

RedisClient.prototype.fetchLinks = function(links) {
  return Promise.all(links.map(link => {
    return this.getLink(link).then(linkData => {
      linkData.link = link
      return linkData
    })
  }))
}

function expectResult(expected, func) {
  return new Promise((resolve, reject) => {
    func((err, result) => err ? reject(err) : resolve(result === expected))
  })
}

RedisClient.prototype.userExists = function(userId) {
  return expectResult(1, done => this.client.exists(userId, done))
}

RedisClient.prototype.findOrCreateUser = function(userId) {
  return this.userExists(userId)
    .then(exists => {
      if (exists) {
        return false
      }
      return expectResult(1, done => this.client.lpush(userId, '', done))
    })
}

RedisClient.prototype.getLink = function(link) {
  return new Promise((resolve, reject) => {
    this.client.hgetall(link, (err, linkData) => {
      if (err) {
        return reject(err)
      } else if (linkData && linkData.clicks) {
        linkData.clicks = parseInt(linkData.clicks)
      }
      resolve(linkData)
    })
  })
}

RedisClient.prototype.getLinks = function(searchString) {
  var searchHelper = new SearchHelper(this, searchString)
  return searchHelper.getLinks()
}

RedisClient.prototype.recordAccess = function(link) {
  return new Promise((resolve, reject) => {
    this.client.hincrby(link, 'clicks', 1, err => err ? reject(err) : resolve())
  })
}

RedisClient.prototype.addLinkToOwner = function(owner, link) {
  return new Promise((resolve, reject) => {
    this.client.lpushx(owner, link, (err, result) => {
      err ? reject(err) : resolve(result !== 0)
    })
  })
}

RedisClient.prototype.removeLinkFromOwner = function(owner, link) {
  return expectResult(1, done => this.client.lrem(owner, 1, link, done))
}

RedisClient.prototype.createLink = function(link, target, owner) {
  return new Promise((resolve, reject) => {
    var createdStamp = this.getTimestamp()

    this.client.hsetnx(link, 'owner', owner, (err, result) => {
      if (err) {
        return reject(err)
      } else if (result === 0) {
        return resolve(false)
      }
      this.client.hmset(link,
        'target', target,
        'created', createdStamp,
        'updated', createdStamp,
        'clicks', 0,
        err => {
          if (err) {
            return reject(new Error(link + ' created, ' +
              'but failed to set target, clicks, and timestamps: ' + err))
          }
          resolve(true)
        })
    })
  })
}

RedisClient.prototype.getOwnedLinks = function(owner) {
  return new Promise((resolve, reject) => {
    this.client.lrange(owner, 0, -1, (err, data) => {
      if (err) {
        return reject(err)
      }
      // Since the model is that users are created with the empty string as the
      // first list element, pop that before returning links.
      data.pop()
      resolve(data)
    })
  })
}

RedisClient.prototype.updateProperty = function(link, property, value) {
  return this.getLink(link)
    .then(linkData => {
      if (!linkData) {
        return Promise.resolve(false)
      }
      return expectResult('OK', done => {
        this.client.hmset(link,
          property, value,
          'updated', this.getTimestamp(),
          done)
      })
    })
}

RedisClient.prototype.deleteLink = function(link) {
  return expectResult(1, done => this.client.del(link, done))
}
