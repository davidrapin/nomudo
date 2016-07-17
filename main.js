'use strict';

const express = require('express');
const fs = require('fs-extra');
const request = require('request');
const bodyParser = require('body-parser');
const path = require('path');
const spawn = require('child_process').spawn;

const USER = 'david';
const PASSWORD = 'nomudopass';
const PORT = 3030;
const YDL_URL = 'https://yt-dl.org/downloads/latest/youtube-dl';
const YDL_PATH = path.resolve(__dirname, 'ydl');
const YDL_BIN_PATH = path.resolve(__dirname, 'ydl', 'youtube-dl');
const DOWNLOAD_PATH = path.resolve(__dirname, 'download');

const app = express();
//app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

const page = (message) => {
  if (!message) { message = ''; }
  
  return `<html>
    <form action="/" method="post">
      <div>
          <label for="username">Username:</label><input type="text" name="username"/>
      </div>
      <div>
          <label for="password">Password:</label><input type="password" name="password"/>
      </div>
      <div>
          <label for="url">URL:</label><input type="text" name="url"/>
      </div>
      <div>
          <input type="submit" value="Ok"/>
      </div>
    </form>
    <div style="font-weight:bold; color:#f00;">${message}</div>
  </html>`;
};

const checkYDL = (done) => {
  fs.ensureDirSync(DOWNLOAD_PATH);
  fs.ensureDirSync(YDL_PATH);
  try {
    var stat = fs.statSync(YDL_BIN_PATH);
    if (stat.size === 0) {
      throw new Error('fle is empty');
    }
    done();
  } catch(e) {
    console.log('Downloading YDL...');
    request({url: YDL_URL, method: 'get', encoding: null}).on('response', (res) => {
      var targetStream = fs.createWriteStream(YDL_BIN_PATH);
      res.pipe(targetStream);
      res.on('end', () => {
        console.log(`Downloading YDL: done (size: ${res.headers['content-length']})`);
        fs.chmodSync(YDL_BIN_PATH, 0755);
        done();
      });
    });
  }
};

const ydl = (url, done) => {
  console.log('Downloading URL: ' + url);
  var child = spawn(YDL_BIN_PATH, [
    '--no-color', 
    '-o', path.resolve(DOWNLOAD_PATH, '%(id)s_%(title)s.%(ext)s')
    url
  ]);
  var out = '';
  var err = '';
  child.stdout.on('data', (data) => { out += data; });
  child.stderr.on('data', (data) => { err += data; });
  child.on('close', (code) => {
    if (err !== '') {
      done(err, out);
    } else {
      done(null, out);
    }
  });
};

app.get('/', (req, res) => {
  res.send(page());
});

app.post('/', (req, res) => {
  if (req.body.username !== USER) {
    return res.send(page('Wrong user.'));
  }
  if (req.body.password !== PASSWORD) {
    return res.send(page('Wrong password.'));
  }
  ydl(req.body.url, (err, out) => {
    if (err) {
      return res.send(page('YDL Error: ' + err));
    } else {
      return res.send(page('Downloade done: ' + out));
    }
  });;  
});

checkYDL((err) => {
  app.listen(PORT, () => {
    console.log('nomudo is listening on port ' + PORT);
  });
});

