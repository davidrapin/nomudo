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

const FFMPEG_PATH = path.resolve(__dirname, 'ffmpeg-3.1.1-64bit-static');
const FFMPEG_URL = 'http://johnvansickle.com/ffmpeg/releases/ffmpeg-release-64bit-static.tar.xz';
const FFMPEG_ARCHIVE = path.resolve(__dirname, 'ffmpeg.tar.xz');

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
    <pre style="font-weight:bold; color:#f00;">${message}</pre>
  </html>`;
};

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
  fs.ensureDirSync(FFMPEG_PATH);
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

const ydl = (url, done) => {
  console.log('Downloading URL: ' + url);
  var child = spawn(YDL_BIN_PATH, [
    '--no-color', 
    '-o', path.resolve(DOWNLOAD_PATH, '%(id)s_%(title)s.%(ext)s'),
    '-f', 'mp3/mp4/aac/bestaudio',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--ffmpeg-location', FFMPEG_PATH,
    url
  ]);
  var out = '', err = '';
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
      return res.send(page('Download done: ' + out));
    }
  });
});

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

