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

  urlp.loadApp = function() {
    window.onhashchange = function() {
      urlp.showView(window.location.hash)
    }
    urlp.showView(window.location.hash)
  }

  urlp.showView = function(hashId) {
    var viewId = hashId.split('-', 1),
        viewParam = hashId.slice(viewId.length + 1),
        container = document.getElementsByClassName('view-container').item(0),
        replacement = container.cloneNode(false),
        routes = {
          '#': urlp.landingView
        },
        renderView = viewId[0] === '#' ? routes[viewId] : null

    if (!renderView) {
      return
    }
    replacement.appendChild(renderView(viewParam))
    container.parentNode.replaceChild(replacement, container)
  }

  urlp.landingView = function() {
    return document.getElementsByClassName('landing-view')
      .item(0).cloneNode(true)
  }
})
