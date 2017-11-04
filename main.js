#!/usr/bin/env node
'use strict';

// DEPS

const express = require('express');
const fs = require('fs-extra');
const request = require('request');
const bodyParser = require('body-parser');
const path = require('path');
const cookieParser = require('cookie-parser')
const spawn = require('child_process').spawn;

// CONSTS

const USER = 'david';
const PASSWORD = 'nomudopass';
const COOKIE_SECRET = 'wellyesthiswaseasytoguessiguess';
const PORT = 3030;
const JOB_HISTORY_SIZE = 10;

const YDL_URL = 'https://yt-dl.org/downloads/latest/youtube-dl';
const YDL_PATH = path.resolve(__dirname, 'ydl');
const YDL_BIN_PATH = path.resolve(__dirname, 'ydl', 'youtube-dl');

const FFMPEG_PATH = path.resolve(__dirname, 'ffmpeg-3.1.1-64bit-static');
const FFMPEG_URL = 'http://johnvansickle.com/ffmpeg/releases/ffmpeg-release-64bit-static.tar.xz';
const FFMPEG_ARCHIVE = path.resolve(__dirname, 'ffmpeg.tar.xz');

// STATE

const state = {
  // {url:string, progress:number, out: string[], err: string[]}
  jobs: new Map(),
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
        ${Array.from(state.jobs.values()).reverse().map((j) => {
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

// SERVER
const app = express();
//app.use(bodyParser.json());
app.use(cookieParser(COOKIE_SECRET));
app.use(bodyParser.urlencoded({extended: true}));

// FUNCTIONS
const checkYDL = (done) => {
  fs.ensureDirSync(DOWNLOAD_PATH);
  fs.ensureDirSync(YDL_PATH);
  try {
    var stat = fs.statSync(YDL_BIN_PATH);
    if (stat.size === 0) {
      throw new Error('file is empty');
    }
    done();
  } catch(e) {
    console.log('Downloading YDL...');
    request({url: YDL_URL, method: 'get', encoding: null}).on('response', (res) => {
      var targetStream = fs.createWriteStream(YDL_BIN_PATH);
      res.pipe(targetStream);
      res.on('end', () => {
        console.log(`Downloading YDL: done (size: ${res.headers['content-length']})`);
        fs.chmodSync(YDL_BIN_PATH, '755');
        done();
      });
    });
  }
};

const checkFFMPEG = (done) => {
  //fs.ensureDirSync(FFMPEG_PATH);
  try {
    fs.statSync(FFMPEG_PATH);
    done();
  } catch(e) {
    console.log('Downloading FFMPEG...');
    request({url: FFMPEG_URL, method: 'get', encoding: null}).on('response', (res) => {
      var targetStream = fs.createWriteStream(FFMPEG_ARCHIVE);
      res.pipe(targetStream);
      res.on('end', () => {
        console.log(`Downloading FFMPEG: done (size: ${res.headers['content-length']})`);
        
        console.log('Unpacking FFMPEG...');
        var child = spawn('tar', ['-xJf', FFMPEG_ARCHIVE]);
        var out = '', err = '';
        child.stdout.on('data', (data) => { out += data; });
        child.stderr.on('data', (data) => { err += data; });
        child.on('close', (code) => {
          if (err !== '') {
            done(err);
          } else {
            console.log('Unpacking FFMPEG... done.');
            done(null);
          }
        });
      });
    });
  }
};

const updateBinary = (done) => {
  console.log('Updating binary');
  runBin(YDL_BIN_PATH, ['-U'], done);
}

const ydl = (url) => {
  let conflict = state.jobs.get(url);
  if (conflict && conflict.running) {
    throw new Error(`Job already running: "${url}`);
  }
  
  const status = startJob(url);
  
  runBin(YDL_BIN_PATH, [
    '--no-color', 
    '-o', path.resolve(DOWNLOAD_PATH, '_%(id)s_%(title)s.%(ext)s'),
    '-f', 'mp3/mp4/aac/bestaudio',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--ffmpeg-location', FFMPEG_PATH,
    url
  ], (err, out) => {
    finishJob(url, out, err);
  
  }, (progress) => {
    console.log(url + ' =progress=> ' + progress);
    status.progress = progress;
  });
};

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

function finishJob(url, out, err) {
  const status = state.jobs.get(url);
  if (!status) { return; }
  status.running = false;
  status.end = Date.now();
  status.out = out;
  status.err = err;
  if (err) {
    status.progress = 'failure';
  } else {
    status.progress = 'success';
  }
}

function runBin(binPath, binArgs, done, progress) {
  var child = spawn(binPath, binArgs);
  var out = '', err = '';
  
  const emitProgress = (str) => {
    if (typeof progress === 'function') {
    
      // match "XXX.XX%" progression strings
      const r = /.*\s(\d{1,3}(?:\.\d{1,2})?%).*/g;
      let m, p = null;
      while (m = r.exec(str)) {
        p = m[1];
      }
      if (p != null) {
        progress(p);
      }
    }
  };
  
  child.stdout.on('data', (data) => {
    out += data;
    emitProgress(out);
  });
  
  child.stderr.on('data', (data) => {
    err += data;
    emitProgress(err);
  });
  
  child.on('close', (code) => {
    if (err !== '') {
      done(err, out);
    } else {
      done(null, out);
    }
  });
}

const getDownloadPath = () => {
  if (process.argv.length !== 3) {
    return fatal('Expected exactly one parameter');
  }
  var p = path.resolve(process.argv[2]);
  var stat = fs.statSync(p);
  if (!stat.isDirectory()) {
    return fatal('Download directory must be a directory (' + p + ')');
  }
  return p;
};

const fatal = (m) => {
  console.error('Error: ' + m);
  process.exit(1);
};

// ROUTES

app.get('/', (req, res) => {
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

// SESSION MANAGEMENT

function setUser(res, username) {
  //console.log('setuser: ' + username);
  const sessionKey = 'ns-' + (Math.random() + '').substr(2);
  res.cookie('nomudo-session', sessionKey, {httpOnly: true}); // , signed: true
  state.sessionStore.set(sessionKey, username);
}

function getUser(req) {
  //console.log('session: ' + req.cookies['nomudo-session']);
  //console.log('cookie: ' + req.headers.cookie);
  if (req.cookies && req.cookies['nomudo-session']) {
    return state.sessionStore.get(req.cookies['nomudo-session']);
  }
  return undefined;
}


// MAIN ----

console.log('NoMuDo!');
const DOWNLOAD_PATH = getDownloadPath();
checkYDL((err) => {
  if (err) { 
    return fatal('Could not install YDL: ' + err);
  }
  
  checkFFMPEG((err) => {
    if (err) { 
      return fatal('Could not install FFMPEG: ' + err);
    }
    
    console.log('Starting Web server ...')
    app.listen(PORT, () => {
      console.log('Web server is listening on port ' + PORT);
    });
  });
});

