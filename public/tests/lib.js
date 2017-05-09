/* eslint-env browser, mocha */
'use strict';

(function(f) { f(window, document) })(function(window, document) {
  var urlp = window.urlp = (window.urlp || {})
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
    fixture.parentNode.replaceChild(fixture.cloneNode(true), fixture)
  }

  urlpTest.getView = function(viewClass) {
    return document.getElementsByClassName('view-container ' + viewClass)
  }
})

before(function() {
  return window.urlpTest.createFixture()
})

beforeEach(function() {
  window.urlpTest.resetFixture()
})
