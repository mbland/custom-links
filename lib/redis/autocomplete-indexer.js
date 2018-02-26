'use strict'

var Keys = require('./keys')
var PromiseHelper = require('./promise-helper')

module.exports = class AutocompleteIndexer {
  constructor(clientImpl) {
    this.impl = clientImpl
    this.setKey = Keys.completeLinksSet()
  }

  // This builds a sorted set of words and their prefixes per:
  // http://oldblog.antirez.com/post/autocomplete-with-redis.html
  addLinkPrefixes(link) {
    // Don't store the leading `/` in our link keys.
    var value = link.slice(1)

    return PromiseHelper.do(done => {
      var args = [this.setKey],
          endIndex = value.length + 1,
          i

      for (i = 1; i != endIndex; ++i) {
        args.push(0)
        args.push(value.slice(0, i))
      }
      args.push(0)
      args.push(value + '*')
      args.push(done)
      this.impl.zadd.apply(this.impl, args)
    })
  }

  removeLink(link) {
    return PromiseHelper.do(done => {
      // We don't store the leading `/` in our link keys.
      this.impl.zrem(this.setKey, link.slice(1) + '*', done)
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
    return PromiseHelper.do(done => {
      this.impl.zrank(this.setKey, prefix, done)
    })
  }

  getSearchPrefixRange(rangeSize) {
    return rank => PromiseHelper.do(done => {
      rank === null ? done(null, []) :
        this.impl.zrange(this.setKey, rank, rank + rangeSize - 1, done)
    })
  }
}
