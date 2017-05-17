/* eslint-env browser */
'use strict';

(function(f) { f(window, document) })(function(window,  document) {
  var urlp = window.urlp = {}

  urlp.xhr = function(method, url, body) {
    return new Promise(function(resolve, reject) {
      var r = new XMLHttpRequest()

      r.open(method, url, true)
      if (typeof body === 'object') {
        body = JSON.stringify(body)
        r.setRequestHeader('Content-Type', 'application/json')
      }

      r.onreadystatechange = function() {
        if (this.readyState === 4) {
          this.status >= 200 && this.status < 300 ? resolve(r) : reject(r)
        }
      }
      r.onerror = function() {
        reject(new Error('A network error occurred. Please check your ' +
          'connection or contact the system administator, then try again.'))
      }
      r.send(body)
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

  urlp.applyData = function(data, element) {
    Object.keys(data).forEach(function(property) {
      var binding = element.querySelector('[data-name=' + property + ']')
      if (binding) {
        if (binding.tagName === 'INPUT') {
          binding.defaultValue = data[property]
        } else {
          binding.textContent = data[property]
        }
      }
    })
    return element
  }

  urlp.landingView = function() {
    var view = urlp.getTemplate('landing-view'),
        editForm = urlp.getTemplate('edit-link')

    view.appendChild(urlp.applyData({ button: 'Create URL' }, editForm))
    return view
  }

  urlp.fade = function(element, increment, deadline) {
    if (window.isNaN(increment) || increment === 0) {
      throw new Error('increment must be a nonzero number: ' + increment)

    } else if (window.isNaN(deadline) || deadline <= 0) {
      throw new Error('deadline must be a positive number: ' + deadline)
    }

    return new Promise(function(resolve) {
      var current = window.parseFloat(
            window.getComputedStyle(element)['opacity']),
          target = increment < 0.0 ? 0 : 1,
          interval = deadline * window.Math.abs(increment),
          style = element.style,
          doFade = function() {
            current += increment

            if ((increment < 0.0 && current <= target) || current >= target) {
              style.opacity = target
              resolve(element)
            } else {
              style.opacity = current
              setTimeout(doFade, interval)
            }
          }
      doFade()
    })
  }

  urlp.flashElement = function(element, replacementHtml) {
    return urlp.fade(element, -0.05, 750).then(function(elem) {
      elem.innerHTML = replacementHtml
      return urlp.fade(element, 0.05, 1000)
    })
  }

  urlp.createLink = function(linkForm) {
    var url = linkForm.querySelector('[data-name=url]'),
        location = linkForm.querySelector('[data-name=location]')

    if (!url || !location) {
      throw new Error('fields missing from link form: ' + linkForm.outerHTML)
    }
    url = url.value.replace(/^\/+/, '')
    location = location.value

    if (url.length === 0) {
      return Promise.reject('Custom link field must not be empty.')
    } else if (location.length === 0) {
      return Promise.reject('Redirect location field must not be empty.')
    } else if (location.match(/https?:\/\//) === null) {
      return Promise.reject('Redirect location protocol must be ' +
        'http:// or https://.')
    }

    return urlp.xhr('POST', '/api/create/' + url, { location: location })
      .then(function() {
        return '/' + url + ' now redirects to ' + location
      })
      .catch(function(err) {
        if (err.status !== undefined) {
          if (err.status >= 400 && err.status < 500) {
            return Promise.reject(err.response.err)
          } else {
            return Promise.reject('A server error occurred and ' +
              '/' + url + ' wasn\'t created. Please contact the system ' +
              'administrator or try again later.')
          }
        }
        return Promise.reject(err.message || err)
      })
  }
})
