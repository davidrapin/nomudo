#!/usr/bin/env node
'use strict';

// DEPS
const express = require('express');
const fs = require('fs-extra');

const bodyParser = require('body-parser');
const path = require('path');
const cookieParser = require('cookie-parser')
const spawn = require('child_process').spawn;

const Utils = require('./utils');
const Ydl = require('./Ydl');

// CONSTS
const USER = 'david';
const PASSWORD = 'nomudopass';
const COOKIE_SECRET = 'wellyesthiswaseasytoguessiguess';
const PORT = 3030;
const JOB_HISTORY_SIZE = 10;



// load options
const optionsPath = path.resolve(_dirname, '..', 'default-options.json');
const options = require(optionsPath);
for (let user of options.users) {
  if (!user.root) {
    // default root
    user.root = './';
  } else if (!path.isAbsolute(user.root)) {
    // make root absolute
    user.root = path.resolve(path.parse(optionsPath).dir, user.root);
  }
  
  var stat = fs.statSync(user.root);
  if (!stat.isDirectory()) {
    return Utils.fatal(`Download directory must be a directory (${user.root})`);
  }
  
  jlog(user, 'user');
}

/*
// STATE
const state = {
  // {url:string, progress:number, out: string[], err: string[]}
  jobs: new Array(),
  sessionStore: new Map()
};

// PAGES
const page = (req, message) => {
  if (!message) { message = ''; }
  const user = getUser(req);
  let form = '';
  
  if (user !== undefined) {
    form = `
      <form action="/" method="post">
        <input type="hidden" name="action" value="download" />
        <div>
          <label for="url">URL:</label><input type="text" name="url"/> <input type="submit" value="download"/>
        </div>
      </form>
      <div style="color:#ccc;">
      
        <div class="job">
        ${state.jobs.reverse().map((j) => {
          return `
            <span class="progress">${j.progress}</span>
            <span class="url">${j.url}</span>
            <span class="date">${new Date(j.start)}</span>
            <span class="out">${j.running ? (j.err ? j.err : j.out) : ''}</span> 
          `;  
        }).join('</div><div class="job">')}
        </div>
        
        download path: ${DOWNLOAD_PATH}<br>
        <form action="/" method="post">
          <input type="hidden" name="action" value="update" />
          <input type="submit" value="update binary"/>
        </form>
      </div>
    `;
    
  } else {
    form = `
      <form action="/" method="post">
        <input type="hidden" name="action" value="login" />
        <div>
            <label for="username">Username:</label><input type="text" name="username"/>
        </div>
        <div>
            <label for="password">Password:</label><input type="password" name="password"/>
        </div>
        <div>
            <input type="submit" value="login"/>
        </div>
      </form>
    `;
  } 
  
  return `<html>
    <style>
    .job {
      border-top: 1px solid #666;
      
    }
    .job > .out {
      font-family: monospace;
      white-space: pre;
    }
    .job > .progress {
      font-weight: bold;
      color: #666;
    }
    </style>
    
    ${form}
    
    <pre style="font-weight:bold; color:#f00;">${message}</pre>
  </html>`;
};
*/

// SERVER
const app = express();
app.use(bodyParser.json());
app.use(cookieParser(COOKIE_SECRET));
//app.use(bodyParser.urlencoded({extended: true}));

class UserState {
  constructor(name) {
    this.name = name;
    this.jobs = [];
  }
}

// STATE
const sessionStore = new Map();
app.use((req, res, next) => {

  /**
   * returns {UserState}
   */
  req.getUser = function() {
    //console.log('session: ' + req.cookies['nomudo-session']);
    //console.log('cookie: ' + req.headers.cookie);
    if (req.cookies && req.cookies['nomudo-session']) {
      return sessionStore.get(req.cookies['nomudo-session']);
    }
    return undefined;
  };

  /**
   * @param {string} username
   */
  res.setUser = function(username) {
    let userState = req.getUser();
    if (userState) {
      log(`already logged in (${username})`);
      return;
    }
    
    userState = Array.from(sessionStore.values()).find(userState => userState.name === username);
    if (userState) {
      log(`creating new session for existing state (${username})`);
    } else {
      log(`creating new session with fresh state (${username})`);
      userState = new UserState(username);
    }
    
    const sessionKey = 'ns-' + (Math.random() + '').substr(2);
    res.cookie('nomudo-session', sessionKey, {httpOnly: true}); // , signed: true
    state.sessionStore.set(sessionKey, userState);
  };
});


// FUNCTIONS



function startJob(url) {
  console.log('Downloading URL: ' + url);
  
  const jobStatus = {
    url: url,
    running: true,
    start: Date.now(),
    end: undefined,
    progress: 'starting',
    out: '',
    err: ''
  };
  state.jobs.set(url, jobStatus);
  
  while (state.jobs.size > JOB_HISTORY_SIZE) {
    const oldestKey = state.jobs.keys();
    state.jobs.delete(oldestKey);
  }
  
  return jobStatus;
}

// ROUTES
const root = path.resolve(__dirname, 'public');
app.use(serveStatic(root));

app.post('/api/login', (req, res) => {
  res.send(page(req));
});

app.post('/', (req, res) => {
  const action = req.body ? req.body.action : '';

  if (action === 'login') {
    if (req.body.username !== USER) {
      return res.send(page(req, 'wrong credentials'));
    }
    if (req.body.password !== PASSWORD) {
      return res.send(page(req, 'wrong credentials'));
    }
    setUser(res, req.body.username);
    return res.redirect('/');
  }
  
  // further actions require login
  if (getUser(req) === undefined) {
    return res.send(page(req, 'credentials required'));
  }
  
  if (action === 'download') {
    try {
      ydl(req.body.url);
      return res.send(page(req, 'Job added'));
    } catch(e) {
      return res.send(page(req, 'Error: ' + e.message));
    }
  }
  
  if (action === 'update') {
    return updateBinary((err, out) => {
      if (err) {
        return res.send(page(req, 'Error: ' + err));
      } else {
        return res.send(page(req, 'Binary updated'));
      }
    });
  }
  
  return res.send(page(req, 'unknown action: ' + action));
});



// MAIN ----

Utils.log('NoMuDo!');
Ydl.check().then(() => {
  Utils.log('Starting Web server ...')
  app.listen(PORT, () => {
    console.log('Web server is listening on port ' + PORT);
  });
});
