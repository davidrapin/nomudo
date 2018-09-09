'use strict';
const path = require('path');

class Utils {

  jlog(o, label) {
    console.log((label ? (label + ':') : '') + JSON.stringify(o, null, '  '));
  }

  log(m) {
    console.log(new Date().toISOString() + ': ' + m);
  }
  
  fatal(m) {
    console.error(new Date().toISOString() + ' (Error): ' + m);
    process.exit(1);
  }
  
  absDir(dir, defaultDir, base) {
    if (!dir) { dir = defaultDir; }
    return path.isAbsolute(dir) ? dir : path.resolve(base, dir);
  }
}

module.exports = new Utils();
