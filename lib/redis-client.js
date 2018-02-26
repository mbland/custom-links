'use strict'

module.exports = RedisClient

function redisKey() {
  return Array.prototype.slice.call(arguments).join(':')
}

function promiseDone(resolve, reject) {
  return (err, result) => err ? reject(err) : resolve(result)
}

function RedisClient(clientImpl, config, getTimestamp) {
  this.impl = clientImpl
  this.rangeSize = (config || {}).REDIS_RANGE_SIZE || 25
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
    this.redisClient.scan(this.cursor, 'match', this.regExp,
      promiseDone(resolve, reject))
  }

  scan() {
    return new Promise((resolve, reject) => {
      this.processResults(resolve, reject)
    }).then(results => this.collectResults(results))
  }
}

const SEARCH_LINKS_KEY = redisKey('search', 'links')

class AutocompleteIndexer {
  constructor(clientImpl) {
    this.impl = clientImpl
  }

  // This builds a sorted set of words and their prefixes per:
  // http://oldblog.antirez.com/post/autocomplete-with-redis.html
  addLinkPrefixes(link) {
    // Don't store the leading `/` in our link keys.
    var value = link.slice(1)

    return new Promise((resolve, reject) => {
      var args = [SEARCH_LINKS_KEY],
          endIndex = value.length + 1,
          i

      for (i = 1; i != endIndex; ++i) {
        args.push(0)
        args.push(value.slice(0, i))
      }
      args.push(0)
      args.push(value + '*')
      args.push(promiseDone(resolve, reject))
      this.impl.zadd.apply(this.impl, args)
    })
  }

  removeLink(link) {
    return new Promise((resolve, reject) => {
      // We don't store the leading `/` in our link keys.
      this.impl.zrem(SEARCH_LINKS_KEY, link.slice(1) + '*',
        promiseDone(resolve, reject))
    })
  }

  // Returns the completed words indexed by addPrefixesToSearchSet() per:
  // http://oldblog.antirez.com/post/autocomplete-with-redis.html
  completeString(prefix, rangeSize) {
    var startRank,
        getRange = this.getSearchPrefixRange(rangeSize),
        collectResults,
        results = []

    collectResults = range => {
      range.filter(i => i.substr(i.length - 1) === '*')
        .filter(i => i.substr(0, prefix.length) === prefix)
        .forEach(i => results.push(i.substr(0, i.length - 1)))

      if (range.length < rangeSize ||
          range[range.length - 1].substr(0, prefix.length) !== prefix) {
        return results
      }
      startRank += rangeSize
      return getRange(startRank).then(collectResults)
    }
    return this.getSearchPrefixRank(prefix)
      .then(rank => startRank = rank)
      .then(getRange)
      .then(collectResults)
  }

  getSearchPrefixRank(prefix) {
    return new Promise((resolve, reject) => {
      this.impl.zrank(SEARCH_LINKS_KEY, prefix, promiseDone(resolve, reject))
    })
  }

  getSearchPrefixRange(rangeSize) {
    return startRank => new Promise((resolve, reject) => {
      if (startRank === null) {
        return resolve([])
      }
      this.impl.zrange(SEARCH_LINKS_KEY, startRank, startRank + rangeSize - 1,
        promiseDone(resolve, reject))
    })
  }
}

class TargetIndexer {
  constructor(clientImpl) {
    this.impl = clientImpl
  }

  static key(target) {
    return redisKey('target', target)
  }

  addLink(link, target) {
    return new Promise((resolve, reject) => {
      this.impl.lpush(TargetIndexer.key(target), link,
        promiseDone(resolve, reject))
    })
  }

  reindexLink(link, prevTarget, newTarget) {
    return prevTarget === newTarget ? Promise.resolve() : Promise.all([
      this.addLink(link, newTarget),
      this.removeLink(link, prevTarget)
    ])
  }

  removeLink(link, target) {
    return removeItemFromList(this.impl, TargetIndexer.key(target), link)
  }

  getLinksToTarget(target) {
    var getLinks = (resolve, reject) => {
      this.impl.lrange(TargetIndexer.key(target), 0, -1,
        promiseDone(resolve, reject))
    }
    return new Promise(getLinks).then(links => links.sort())
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

function expectResult(expected, func) {
  return new Promise((resolve, reject) => {
    func((err, result) => err ? reject(err) : resolve(result === expected))
  })
}

function removeItemFromList(clientImpl, key, item) {
  return expectResult(1, done => clientImpl.lrem(key, 1, item, done))
}

RedisClient.prototype.userExists = function(userId) {
  return expectResult(1, done => this.impl.exists(userId, done))
}

RedisClient.prototype.findOrCreateUser = function(userId) {
  return this.userExists(userId)
    .then(exists => {
      if (exists) {
        return false
      }
      return expectResult(1, done => this.impl.lpush(userId, '', done))
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
  return removeItemFromList(this.impl, owner, link)
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
      return expectResult('OK', done => {
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
  return expectResult(1, done => this.impl.del(link, done))
}

RedisClient.prototype.deindexLink = function(link, linkInfo) {
  return Promise.all([
    new AutocompleteIndexer(this.impl).removeLink(link),
    new TargetIndexer(this.impl).removeLink(link, linkInfo.target)
  ])
}
