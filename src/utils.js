'use strict';

class Utils {

  jlog(o, label) {
    console.log((label ? (label + ':') : '') + JSON.stringify(o, null, '  ');
  }

  log(m) {
    console.log(new Date().toISOString() + ': ' + m);
  }
  
  fatal(m) {
    console.error(new Date().toISOString() + ' (Error): ' + m);
    process.exit(1);
  }

}

module.exports = new Utils();
