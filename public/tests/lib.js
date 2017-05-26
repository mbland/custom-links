/* eslint-env browser, mocha */
'use strict';

(function(f) { f(window, document) })(function(window, document) {
  var urlp = window.urlp
  var urlpTest = window.urlpTest = {}
  var fixture = urlpTest.fixture = document.createElement('div')

  urlpTest.createFixture = function() {
    return urlp.xhr('GET', '/index.html').then(function(xhr) {
      fixture.innerHTML = xhr.responseText
      fixture = fixture.getElementsByClassName('markup').item(0)
      fixture.className = 'fixture'
      fixture.style.display = 'none'
      document.body.appendChild(fixture.cloneNode(true))
    })
  }

  urlpTest.resetFixture = function() {
    var oldFixture = document.getElementsByClassName('fixture').item(0)
    oldFixture.parentNode.replaceChild(fixture.cloneNode(true), oldFixture)
  }

  urlpTest.getView = function(viewClass) {
    return document.getElementsByClassName('view-container').item(0)
      .getElementsByClassName(viewClass)
  }

  urlpTest.handleXhrError = function(description) {
    return function(err) {
      console.log('failed to ' + description + ': ' + (err.message || err))
    }
  }
})

before(function() {
  return window.urlpTest.createFixture()
    .then(function() {
      if (window.__coverage__) {
        return window.urlp.xhr('POST', '/coverage/reset')
          .catch(window.urlpTest.handleXhrError('clear coverage data'))
      }
    })
})

beforeEach(function() {
  return window.urlpTest.resetFixture()
})

after(function() {
  if (window.__coverage__) {
    return window.urlp.xhr('POST', '/coverage/client', window.__coverage__)
      .catch(window.urlpTest.handleXhrError('post coverage data'))
  }
})
