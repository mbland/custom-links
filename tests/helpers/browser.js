/* eslint-env node, browser */
'use strict'

window.chaiAsPromised = require('chai-as-promised')

if (window.callPhantom) {
  require('es6-promise').polyfill()
}
