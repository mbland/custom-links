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
        container = document.getElementsByClassName('view-container')[0],
        replacement = container.cloneNode(false),
        routes = {
          '#': urlp.landingView
        },
        renderView = routes[viewId]

    if (!renderView) {
      if (container.children.length !== 0) {
        return
      }
      renderView = routes['#']
    }
    replacement.appendChild(renderView(viewParam))
    container.parentNode.replaceChild(replacement, container)
  }

  urlp.getTemplate = function(templateName) {
    var template

    if (!urlp.templates) {
      urlp.templates = document.getElementsByClassName('templates')[0]
    }
    template = urlp.templates.getElementsByClassName(templateName)[0]

    if (!template) {
      throw new Error('unknown template name: ' + templateName)
    }
    return template.cloneNode(true)
  }

  urlp.landingView = function() {
    var view = urlp.getTemplate('landing-view'),
        editForm = urlp.getTemplate('edit-link')

    editForm.getElementsByTagName('button')[0].textContent = 'Create URL'
    view.appendChild(editForm)
    return view
  }
})
