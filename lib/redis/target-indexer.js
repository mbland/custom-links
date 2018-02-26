'use strict'

var Keys = require('./keys')
var ListHelper = require('./list-helper')
var PromiseHelper = require('./promise-helper')

module.exports = class TargetIndexer {
  constructor(clientImpl) {
    this.impl = clientImpl
  }

  addLink(link, linkInfo) {
    return PromiseHelper.do(done => {
      this.impl.lpush(Keys.targetIndex(linkInfo.target), link, done)
    })
  }

  shouldReindexLink(link, prevInfo, newInfo) {
    return newInfo.target && newInfo.target !== prevInfo.target
  }

  removeLink(link, linkInfo) {
    return new ListHelper(this.impl)
      .removeItem(Keys.targetIndex(linkInfo.target), link)
  }

  getLinksToTarget(target) {
    var getLinks = done => {
      this.impl.lrange(Keys.targetIndex(target), 0, -1, done)
    }
    return PromiseHelper.do(getLinks).then(links => links.sort())
  }
}
