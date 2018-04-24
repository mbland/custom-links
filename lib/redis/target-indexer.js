'use strict'

var Keys = require('./keys')
var PromiseHelper = require('./promise-helper')

module.exports = class TargetIndexer {
  constructor(clientImpl) {
    this.impl = clientImpl
  }

  addLink(link, linkInfo) {
    return PromiseHelper.do(done => {
      this.impl.sadd(Keys.targetIndex(linkInfo.target), link, done)
    })
  }

  shouldReindexLink(link, prevInfo, newInfo) {
    return newInfo.target && newInfo.target !== prevInfo.target
  }

  removeLink(link, linkInfo) {
    return PromiseHelper.do(done => {
      this.impl.srem(Keys.targetIndex(linkInfo.target), link, done)
    })
  }

  getLinksToTarget(target) {
    return PromiseHelper
      .do(done => this.impl.smembers(Keys.targetIndex(target), done))
      .then(links => links.sort())
  }
}
