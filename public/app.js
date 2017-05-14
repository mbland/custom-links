/* eslint-env browser */
'use strict';

(function(f) { f(window, document) })(function(window,  document) {
  var urlp = window.urlp = {}

  urlp.xhr = function(method, url) {
    return new Promise(function(resolve, reject) {
      var r = new XMLHttpRequest()

      r.open(method, url, true)
      r.onreadystatechange = function() {
        if (this.readyState === 4) {
          this.status >= 200 && this.status < 300 ? resolve(r) : reject(r)
        }
      }
      r.onerror = reject
      r.send()
    })
  }

  urlp.showView = function(hashId) {
    var container = document.getElementsByClassName('view-container').item(0),
        replacement = container.cloneNode(false),
        routes = {
          '': urlp.landingView
        },
        renderView = routes[hashId]

    if (!renderView) {
      return
    }
    replacement.appendChild(renderView())
    container.parentNode.replaceChild(replacement, container)
  }

  urlp.landingView = function() {
    return document.getElementsByClassName('landing-view')
      .item(0).cloneNode(true)
  }
})
