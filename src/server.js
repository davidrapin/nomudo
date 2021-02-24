#!/usr/bin/env node
'use strict';

const process = require('process');
const path = require('path');
const spawn = require('child_process').spawn;

// libs
const express = require('express');
const fs = require('fs-extra');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const serveStatic = require('serve-static');
const cookieParser = require('cookie-parser')

const readdirP = (dir, param) => {
  return new Promise((resolve, reject) => {
    try {
      resolve(fs.readdirSync(dir, param));
    } catch(e) {
      reject(e);
    }
  });
};
// Promise.promisify(fs.readdir);

// deps
const Utils = require('./utils');
const Ydl = require('./Ydl');

const COOKIE_SECRET = Math.floor(Math.random() * 10000) + '_cookie_secret';
const AMPLITUDE_PATH = path.resolve(__dirname, '..', 'node_modules', 'amplitudejs', 'dist', 'amplitude.min.js');
const NOSLEEP_PATH = path.resolve(__dirname, '..', 'node_modules', 'nosleep.js', 'dist', 'NoSleep.min.js');

// load options
class User {
  constructor(user, defaultAbsRoot, baseDir) {
    this.username = user.username;
    this.password = user.password;
    this.root = user.root;
    this.jobs = (user.jobs || []).map(job => Ydl.parseJob(job));
    
    this.absRoot = Utils.absDir(user.root, defaultAbsRoot, baseDir);
    var stat = fs.statSync(this.absRoot);
    if (!stat.isDirectory()) {
      return Utils.fatal(`Download directory must be a directory (${this.absRoot})`);
    }
    
    this.serveStatic = serveStatic(this.absRoot, {});
    
    Utils.jlog({username: this.username, root: this.absRoot}, 'user');
  }
  
  _listFiles(root, suffix, accumulator) {
    //console.log(root + ' (reading dir)');
    return readdirP(root, {withFileTypes: true}).each((entry) => {
      //console.log(root + ' (entry) ' + entry.name);
      const entryPath = path.resolve(root, entry.name);
      
      if (entry.isDirectory()) {
        return this._listFiles(entryPath, suffix, accumulator);
      }
      
      if (entry.name.endsWith(suffix)) {
        //console.log(root + ' (adding) ' + entry.name);
        accumulator.push(entryPath);
      }
    }).catch(e => {
      console.log('Could not read files in ' + root + ': ' + e.stack);
    });
  }
  
  listFiles(extension) {
    const list = [];
    return this._listFiles(this.absRoot, '.' + extension, list).then(() => {
      return list.map(dir => path.relative(this.absRoot, dir));
    });
  }
  
  asPublic() {
    return {
      username: this.username, 
      root: this.absRoot,
      jobs: this.jobs.map(j => j.asPublic())
    }
  }
  
  serialize() {
    return {
      username: this.username,
      password: this.password,
      root: this.root,
      jobs: this.jobs.map(j => j.asPublic())
    };
  }
}

class Options {
  constructor() {
    this.path = path.resolve(process.env.NOMUDO_OPTIONS || './nomudo-options.json');

    const stat = fs.statSync(this.path);
    if (!stat.isFile()) {
      Utils.log(`Options file not found: "${this.path}", creating...`);
      const defaults = require(path.resolve(__dirname, '..', 'default-options.json'));
      fs.writeJsonSync(this.path, defaults);
      Utils.log(`Options file generated from defaults, OK.`);
    }

    const stat2 = fs.statSync(this.path);
    if (!stat2.isFile()) {
      Utils.fatal(`Options file not found at "${this.path}"...`);
    }

    this.parse(require(this.path));
    Utils.log(`Options file loaded from "${this.path}".`);

  }

  parse(options) {
    const baseDir = path.parse(this.path).dir;

    this.port = options.port || 3030;
    this.root = options.root;
    this.absRoot = Utils.absDir(options.root, '.', baseDir);
    this.users = options.users.map(u => new User(u, this.absRoot, baseDir));
  }
  
  save() {
    const options = {
      root: this.root,
      port: this.port,
      users: this.users.map(u => u.serialize())
    }
    Utils.log('Saving state...');
    fs.writeFileSync(this.path, JSON.stringify(options, null, '  '));
    Utils.log('State saved OK.');
  }
}

// State
class State {
  constructor() {
    // key: cookie (string)
    // value: user (User)
    this.sessions = new Map();
    
    this.cookieName = 'nomudo-session';
  }
  
  patchReq(req) {
    req.getUser = () => this.getCurrentUser(req);
  }
  
  /**
   * @param {} request
   * @returns {User}
   */
  getCurrentUser(request) {
    if (!request.cookies) {
      Utils.log('no cookies in this request');
      return undefined;
    }
  
    const sessionKey = request.cookies[this.cookieName];
    if (!sessionKey) { return undefined; }
    
    return this.sessions.get(sessionKey);
  }
  
  /**
   * @param {} request
   * @param {} response
   * @param {user} user 
   * @returns {User}
   */
  setCurrentUser(request, response, user) {
    if (user === undefined) {
      this._logout(request, response);
      return;
    }
    
    let currentUser = this.getCurrentUser(request);
    if (currentUser) {
      Utils.log(`already logged in as "${currentUser.username}"`);
      return currentUser;
    }
    
    const sessionKey = 'ns-' + (Math.random() + '').substr(2);
    response.cookie(this.cookieName, sessionKey, {httpOnly: true}); // , signed: true
    this.sessions.set(sessionKey, user);
    return user;
  }
  
  _logout(request, response) {
    if (!request.cookies) {
      Utils.log('logout: no cookies in this request');
      return undefined;
    }
  
    const sessionKey = request.cookies[this.cookieName];
    if (!sessionKey) { return undefined; }
    
    const user = this.sessions.get(sessionKey);
    if (!user) { return undefined; }
    
    Utils.log(`logging out user ${user.username}`);
    this.sessions.delete(sessionKey);
    response.clearCookie(this.cookieName);
  }
}


// Access
class Access {
  constructor(options, state) {
    this.options = options;
    this.state = state;
  }

  findUser(username, password) {
    for (let user of this.options.users) {
      if (user.username === username && user.password === password) {
        return user;
      }
    }
    return undefined;
  }
  
  /**
   * @param {string} username
   * @param {string} password
   * @returns {User}
   */
  login(req, res, username, password) {
    const user = this.findUser(username, password);
    if (!user) { return undefined; }
    return this.state.setCurrentUser(req, res, user);
  }
  
  logout(req, res) {
    return this.state.setCurrentUser(req, res, undefined);
  }
  
  me(req) {
    return req.getUser();
  }
}

// SERVER
const app = express();
app.use(bodyParser.json());
app.use(cookieParser(COOKIE_SECRET));

// ROUTES
const root = path.resolve(__dirname, 'public');
app.use(serveStatic(root));

app.use((req, res, next) => {
  state.patchReq(req);
  next();
});

app.get('/amplitude.js', (req, res) => {
  res.sendFile(AMPLITUDE_PATH);
});

app.get('/nosleep.js', (req, res) => {
  res.sendFile(NOSLEEP_PATH);
});

app.post('/api/auth/login', (req, res) => {
  const user = access.login(req, res, req.body.username, req.body.password);
  if (user) {
    res.status(200).json(user.asPublic());
  } else {
    res.status(401).json({error: 'wrong credentials'});
  }
});

app.post('/api/auth/logout', (req, res) => {
  access.logout(req, res);
  res.status(204).end();
});

app.get('/api/auth/me', (req, res) => {
  const user = req.getUser();
  if (user) {
    res.status(200).json(user.asPublic());
  } else {
    res.status(401).json({error: 'no current user'});
  }
});

app.all('/api/ydl/*', (req, res, next) => {
  const user = req.getUser();
  if (!user) {
    return res.status(401).json({error: 'auth required'});
  } else {
    next();
  }
});

app.post('/api/ydl/update', (req, res) => {
  return Ydl.update().then(() => {
    res.status(200).json({result: 'Binary updated'});
  }).catch(err => {
    res.status(500).json({error: err.stack});
  });
});

app.post('/api/ydl/download', (req, res) => {
  try {
    const user = req.getUser();
    const job = Ydl.download(req.body.url, user.absRoot);
    user.jobs.push(job);
    res.status(200).json({result: 'Job added'});
  } catch (err) {
    res.status(500).json({error: err.stack});
  }
});

app.all('/api/file*', (req, res, next) => {
  const user = req.getUser();
  if (!user) {
    return res.status(401).json({error: 'auth required'});
  } else {
    next();
  }
});

app.get('/api/files', (req, res) => {
  const user = req.getUser();
  user.listFiles('mp3').then((files) => {
    res.status(200).json({result: files.map(f => `/api/file/${f}`)});
  }).catch((e) => {
    res.status(500).json({error: err.stack});
  });
});

app.get('/api/file/*', (req, res, next) => {
  const user = req.getUser();
  req.url = req.url.substr('/api/file'.length);
  user.serveStatic(req, res, next);
});

// MAIN ----

Utils.log('NoMuDo!');

const options = new Options();
const state = new State();
const access = new Access(options, state);

//process.on('exit', (code) => options.save());
//process.on('SIGTERM', (code) => options.save());
process.on('SIGINT', () => {
  console.log('');
  options.save();
  process.exit(0);
});

Ydl.check().then(() => {
  Utils.log('Starting Web server ...')
  app.listen(options.port, () => {
    Utils.log('Web server is listening on port ' + options.port);
  });
});
