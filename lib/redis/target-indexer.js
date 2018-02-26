'use strict'

var Keys = require('./keys')
var ListHelper = require('./list-helper')
var PromiseHelper = require('./promise-helper')

module.exports = class TargetIndexer {
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
