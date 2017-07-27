/* eslint-env browser, mocha */
'use strict';

(function(f) { f(window, document) })(function(window, document) {
  var cl = window.cl
  var clTest = window.clTest = {}
  var fixture = clTest.fixture = document.createElement('div')

  window.expect = window.chai.expect
  window.chai.should()
  window.chai.use(window.chaiAsPromised)

  clTest.createFixture = function() {
    return cl.xhr('GET', '/index.html').then(function(xhr) {
      fixture.innerHTML = xhr.responseText
      fixture = fixture.getElementsByClassName('markup').item(0)
      fixture.className = 'fixture'
      fixture.style.display = 'none'
      document.body.appendChild(fixture.cloneNode(true))
    })
  }

  clTest.resetFixture = function() {
    var oldFixture = document.getElementsByClassName('fixture').item(0)
    oldFixture.parentNode.replaceChild(fixture.cloneNode(true), oldFixture)
  }

  clTest.getView = function(viewClass) {
    return document.getElementsByClassName('view-container').item(0)
      .getElementsByClassName(viewClass)
  }

  clTest.handleXhrError = function(description) {
    return function(err) {
      console.log('failed to ' + description + ': ' + (err.message || err))
    }
  }
})

before(function() {
  return window.clTest.createFixture()
    .then(function() {
      if (window.__coverage__) {
        return window.cl.xhr('POST', '/coverage/reset')
          .catch(window.clTest.handleXhrError('clear coverage data'))
      }
    })
    .catch(function(err) {
      console.error('failed to create test fixture:',
        err.message ? err : err.statusText)
    })
})

beforeEach(function() {
  return window.clTest.resetFixture()
})

after(function() {
  if (window.__coverage__) {
    return window.cl.xhr('POST', '/coverage/client', window.__coverage__)
      .catch(window.clTest.handleXhrError('post coverage data'))
  }
})
