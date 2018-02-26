'use strict'

var PromiseHelper = require('./promise-helper')

module.exports = class ListHelper {
  constructor(clientImpl) {
    this.impl = clientImpl
  }

  removeItem(key, item) {
    return PromiseHelper.expect(1, done => this.impl.lrem(key, 1, item, done))
  }
}
