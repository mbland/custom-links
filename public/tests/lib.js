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

  // Use this to create elements appended directly to the body so the computed
  // style isn't influenced by clTest.fixture's "display: none" style.
  clTest.createVisibleElement = function(tagName) {
    return document.body.appendChild(document.createElement(tagName))
  }

  clTest.removeElement = function(element) {
    element.parentNode.removeChild(element)
  }

  clTest.handleXhrError = function(description) {
    return function(err) {
      console.log('failed to ' + description + ': ' + (err.message || err))
    }
  }

  // For some reason, Firefox's window.getSelection() returns the empty string,
  // hence we can't just do:
  //
  //   document.getSelection().toString().should.equal(data.target)
  //
  // See:
  // - https://stackoverflow.com/a/20427804
  // - https://stackoverflow.com/a/10596963
  // - https://bugzilla.mozilla.org/show_bug.cgi?id=85686
  clTest.getSelection = function() {
    var element = document.activeElement
    return element.value.substring(element.selectionStart, element.selectionEnd)
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
