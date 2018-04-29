/* eslint-env node, browser */
'use strict'

window.chaiAsPromised = require('chai-as-promised')

if (window.Promise === undefined) {
  require('es6-promise').polyfill()
}

if (Array.from === undefined) {
  Array.from = function(obj) {
    var result = [],
        i

    for (i = 0; i !== obj.length; ++i) {
      result.push(obj[i])
    }
    return result
  }
}

// Thanks to:
// - http://sticksnglue.com/wordpress/phantomjs-1-9-and-keyboardevent/
// - https://www.npmjs.com/package/basic-keyboard-event-polyfill
if (typeof window.KeyboardEvent !== 'function') {
  window.KeyboardEvent = function(eventString) {
    var keyboardEvent = document.createEvent('KeyboardEvent')
    keyboardEvent.initKeyboardEvent(eventString, true, true, window, 1, 0, 0)
    return keyboardEvent
  }
}
