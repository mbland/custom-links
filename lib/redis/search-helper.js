'use strict'

var PromiseHelper = require('./promise-helper')

module.exports = class SearchHelper {
  constructor(redisClient, searchString, keyPrefix) {
    this.links = []
    this.redisClient = redisClient
    this.cursor = 0
    this.pattern = `${keyPrefix}*${searchString ? searchString + '*' : ''}`
  }

  collectResults([cursorNext, results]) {
    this.links.push(...results)
    this.cursor = parseInt(cursorNext)
    return this.cursor ? this.scan() : Promise.resolve(this.links)
  }

  processResults() {
    return PromiseHelper.do(done => {
      this.redisClient.scan(this.cursor, 'match', this.pattern, done)
    })
  }

  scan() {
    return this.processResults().then(results => this.collectResults(results))
  }
}
