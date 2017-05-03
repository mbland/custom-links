'use strict'

var path = require('path')
var express = require('express')

module.exports = {
  assembleApp: assembleApp
}

function makeErrorHandler(req, res, logger) {
  return function(err) {
    logger.error(err)
    res.status(500)
    res.send('Error while processing ' + req.originalUrl + ': ' + err)
  }
}

function assembleApp(app, redirectDb, logger) {
  app.use(express.static(path.join(__dirname, '..', 'public')))

  app.get('/*', function(req, res) {
    redirectDb.getRedirect(req.path)
      .then(function(urlData) {
        res.redirect(urlData !== null ? urlData.location : '/?url=' + req.path)
      })
      .catch(makeErrorHandler(req, res, logger))
  })
  return app
}
