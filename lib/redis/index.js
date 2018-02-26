'use strict'

var Keys = require('./keys')
var PromiseHelper = require('./promise-helper')
var ListHelper = require('./list-helper')
var SearchHelper = require('./search-helper')
var AutocompleteIndexer = require('./autocomplete-indexer')

module.exports = RedisClient

function RedisClient(clientImpl, config, getTimestamp) {
  this.impl = clientImpl
  this.rangeSize = (config || {}).REDIS_RANGE_SIZE || 25
  this.getTimestamp = getTimestamp || (() => new Date().getTime())
}

class TargetIndexer {
  constructor(clientImpl) {
    this.impl = clientImpl
  }

  addLink(link, target) {
    return PromiseHelper.do(done => {
      this.impl.lpush(Keys.targetIndex(target), link, done)
    })
  }

  reindexLink(link, prevTarget, newTarget) {
    return prevTarget === newTarget ? Promise.resolve() : Promise.all([
      this.addLink(link, newTarget),
      this.removeLink(link, prevTarget)
    ])
  }

  removeLink(link, target) {
    return new ListHelper(this.impl).removeItem(Keys.targetIndex(target), link)
  }

  getLinksToTarget(target) {
    var getLinks = done => {
      this.impl.lrange(Keys.targetIndex(target), 0, -1, done)
    }
    return PromiseHelper.do(getLinks).then(links => links.sort())
  }
}

RedisClient.prototype.fetchLinkData = function(links) {
  return Promise.all(links.map(link => {
    return this.getLink(link).then(linkData => {
      linkData.link = link
      return linkData
    })
  }))
}

RedisClient.prototype.userExists = function(userId) {
  return PromiseHelper.expect(1, done => this.impl.exists(userId, done))
}

RedisClient.prototype.findOrCreateUser = function(userId) {
  return this.userExists(userId)
    .then(exists => {
      if (exists) {
        return false
      }
      return PromiseHelper.expect(1, done => this.impl.lpush(userId, '', done))
    })
}

RedisClient.prototype.getLink = function(link) {
  return new Promise((resolve, reject) => {
    this.impl.hgetall(link, (err, linkData) => {
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
  var searchHelper = new SearchHelper(this.impl, searchString)
  return searchHelper.scan().then(links => this.fetchLinkData(links.sort()))
}

RedisClient.prototype.recordAccess = function(link) {
  return new Promise((resolve, reject) => {
    this.impl.hincrby(link, 'clicks', 1, err => err ? reject(err) : resolve())
  })
}

RedisClient.prototype.addLinkToOwner = function(owner, link) {
  return new Promise((resolve, reject) => {
    this.impl.lpushx(owner, link, (err, result) => {
      err ? reject(err) : resolve(result !== 0)
    })
  })
}

RedisClient.prototype.removeLinkFromOwner = function(owner, link) {
  return new ListHelper(this.impl).removeItem(owner, link)
}

RedisClient.prototype.createLink = function(link, target, owner) {
  return new Promise((resolve, reject) => {
    var createdStamp = this.getTimestamp()

    this.impl.hsetnx(link, 'owner', owner, (err, result) => {
      if (err) {
        return reject(err)
      } else if (result === 0) {
        return resolve(false)
      }
      this.impl.hmset(link,
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

RedisClient.prototype.indexLink = function(link, linkInfo) {
  return Promise.all([
    new AutocompleteIndexer(this.impl).addLinkPrefixes(link),
    new TargetIndexer(this.impl).addLink(link, linkInfo.target)
  ])
}

RedisClient.prototype.completeLink = function(prefix) {
  const MIN_LINK_PREFIX_SIZE = 3

  return prefix.length < MIN_LINK_PREFIX_SIZE ? Promise.resolve([]) :
    new AutocompleteIndexer(this.impl).completeString(prefix, this.rangeSize)
}

RedisClient.prototype.getLinksToTarget = function(target) {
  return new TargetIndexer(this.impl).getLinksToTarget(target)
}

RedisClient.prototype.getOwnedLinks = function(owner) {
  return new Promise((resolve, reject) => {
    this.impl.lrange(owner, 0, -1, (err, data) => {
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
      return PromiseHelper.expect('OK', done => {
        this.impl.hmset(link,
          property, value,
          'updated', this.getTimestamp(),
          done)
      })
    })
}

RedisClient.prototype.reindexLink = function(link, prevInfo, newInfo) {
  return new TargetIndexer(this.impl)
    .reindexLink(link, prevInfo.target, newInfo.target)
}

RedisClient.prototype.deleteLink = function(link) {
  return PromiseHelper.expect(1, done => this.impl.del(link, done))
}

RedisClient.prototype.deindexLink = function(link, linkInfo) {
  return Promise.all([
    new AutocompleteIndexer(this.impl).removeLink(link),
    new TargetIndexer(this.impl).removeLink(link, linkInfo.target)
  ])
}
