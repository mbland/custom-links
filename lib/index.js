'use strict'

var path = require('path')
var express = require('express')

module.exports = {
  assembleApp: assembleApp
}

function assembleApp(app, redirectDb, logger) {
  app.use(express.static(path.join(__dirname, '..', 'public')))
  app.use('/api', assembleApiRouter(redirectDb, logger))

  app.get('/*', function(req, res) {
    redirectDb.getRedirect(req.path, { recordAccess: true })
      .then(function(urlData) {
        res.redirect(urlData !== null ? urlData.location : '/?url=' + req.path)
      })
      .catch(errorHandler(req, res, logger))
  })
  return app
}

function errorHandler(req, res, logger, method) {
  return function(err) {
    var response
    logger.error(err)

    if (err instanceof Error) {
      res.sendStatus(500)
    } else {
      response = (method === 'json') ? { err: err } : err
      res.status(403)[method || 'send'](response)
    }
  }
}

function assembleApiRouter(redirectDb, logger) {
  var router = express.Router(),
      urlParam = ':url(/[A-Za-z0-9_.-]+)'

  router.get('/info' + urlParam, function(req, res) {
    redirectDb.getRedirect(req.params.url)
      .then(function(urlInfo) {
        if (urlInfo !== null) {
          res.status(200)
          res.json(urlInfo)
        } else {
          res.sendStatus(404)
        }
      })
      .catch(errorHandler(req, res, logger, 'json'))
  })

  router.all('/*', function(req, res) {
    res.sendStatus(400)
  })

  return router
}
