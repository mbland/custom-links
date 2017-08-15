'use strict'

module.exports = EnvVars

function EnvVars(prefix) {
  this.prefix = prefix
  this.varsToDelete = []
  this.varsToRestore = []
}

EnvVars.prototype.setEnvVar = function(name, value) {
  name = this.prefix + name
  process.env[name] = value
  this.varsToDelete.push(name)
}

EnvVars.prototype.saveEnvVars = function() {
  Object.keys(process.env).forEach(name => {
    if (name.startsWith(this.prefix)) {
      this.varsToRestore[name] = process.env[name]
      delete process.env[name]
    }
  })
}

EnvVars.prototype.restoreEnvVars = function() {
  this.varsToDelete.forEach(function(name) {
    delete process.env[name]
  })
  Object.keys(this.varsToRestore).forEach(name => {
    process.env[name] = this.varsToRestore[name]
  })
}
