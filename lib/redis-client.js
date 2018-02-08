'use strict'

module.exports = RedisClient

function key() {
  return Array.prototype.slice.call(arguments).join(':')
}

const SEARCH_LINKS_KEY = key('search', 'links')
const SEARCH_TARGETS_KEY = key('search', 'targets')
const MAX_COMPLETIONS = 10

function targetLinksKey(target) {
  return key('target', target)
}

function promiseDone(resolve, reject) {
  return (err, result) => err ? reject(err) : resolve(result)
}

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
    this.redisClient.scan(this.cursor, 'match', this.regExp,
      promiseDone(resolve, reject))
  }

  scan() {
    return new Promise((resolve, reject) => {
      this.processResults(resolve, reject)
    }).then(results => this.collectResults(results))
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
  var searchHelper = new SearchHelper(this.client, searchString)
  return searchHelper.scan().then(links => this.fetchLinkData(links.sort()))
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
          addLinkToSearchSets(this.client, link, target, resolve, reject)
        })
    })
  })
}

function addLinkToSearchSets(client, link, target, resolve, reject) {
  var ops = [
    // Don't store the leading `/` in our link keys.
    addPrefixesToSearchSet(client, SEARCH_LINKS_KEY, link.slice(1)),
    addPrefixesToSearchSet(client, SEARCH_TARGETS_KEY, target),
    addLinkToTargetList(client, target, link)
  ]

  Promise.all(ops)
    .then(() => resolve(true))
    .catch(err => reject(err))
}

// This builds a sorted set of words and their prefixes per:
// http://oldblog.antirez.com/post/autocomplete-with-redis.html
function addPrefixesToSearchSet(client, setName, value) {
  return new Promise((resolve, reject) => {
    var args = [setName],
        i

    for (i = 1; i != value.length; ++i) {
      args.push(0)
      args.push(value.slice(0, i))
    }
    args.push(0)
    args.push(value + '*')
    args.push(promiseDone(resolve, reject))
    client.zadd.apply(client, args)
  })
}

function addLinkToTargetList(client, target, link) {
  return new Promise((resolve, reject) => {
    client.lpush(targetLinksKey(target), link, promiseDone(resolve, reject))
  })
}

RedisClient.prototype.completeLink = function(prefix) {
  return completeString(this.client, SEARCH_LINKS_KEY, prefix)
}

RedisClient.prototype.completeTarget = function(prefix) {
  if (prefix.length < 7 || prefix === 'http://' || prefix === 'https://') {
    return Promise.resolve([])
  }
  return completeString(this.client, SEARCH_TARGETS_KEY, prefix)
}

// Returns the completed words indexed by addPrefixesToSearchSet() per:
// http://oldblog.antirez.com/post/autocomplete-with-redis.html
function completeString(client, setName, prefix) {
  var getRank,
      getRange

  getRank = () => new Promise((resolve, reject) => {
    client.zrank(setName, prefix, promiseDone(resolve, reject))
  })
  getRange = (rank) => new Promise((resolve, reject) => {
    client.zrange(setName, rank + 1, -1, promiseDone(resolve, reject))
  })
  return getRank().then(getRange).then((results) => {
    return results
      .filter(result => result.substr(0, prefix.length) === prefix)
      .filter(result => result.substr(result.length - 1) === '*')
      .map(result => result.substr(0, result.length - 1))
      .slice(0, MAX_COMPLETIONS)
  })
}

RedisClient.prototype.getLinksToTarget = function(target) {
  var getTargetLinks

  getTargetLinks = () => new Promise((resolve, reject) => {
    this.client.lrange(targetLinksKey(target), 0, -1,
      promiseDone(resolve, reject))
  })
  return getTargetLinks().then(links => links.sort())
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
