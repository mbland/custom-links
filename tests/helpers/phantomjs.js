/* eslint-env node, browser */
'use strict'
if (typeof window.initMochaPhantomJS === 'function') {
  window.initMochaPhantomJS()
}
if (window.callPhantom) {
  require('es6-promise').polyfill()
}
