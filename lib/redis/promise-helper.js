'use strict'

/* Promise invocation utilities
 *
 * Eliminates a lot of boilerplate code for wrapping typical Node.js functions
 * that accept a `done(err, data)` callback.
 */
module.exports = class PromiseHelper {
  static do(cb) {
    return new Promise((resolve, reject) => {
      cb((err, data) => err ? reject(err) : resolve(data))
    })
  }

  static expect(expected, cb) {
    return PromiseHelper.do(cb).then(data => data === expected)
  }
}
