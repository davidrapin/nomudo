const express = require('express');
const fs = require('fs-extra');
const request = require('request');
const bodyParser = require('body-parser');
const path = require('path');

const USER = 'david';
const PASSWORD = 'nomudopass';
const PORT = 3030;
const YDL_URL = 'https://yt-dl.org/downloads/latest/youtube-dl';
const YDL_PATH = path.resolve(__dirname, 'ydl');
const YDL_BIN_PATH = path.resolve(__dirname, 'ydl', 'youtube-dl');

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
  fs.ensureDirSync(YDL_PATH);
  if (fs.accessSync(YDL_BIN_PATH)) {
    done();
  } else {
  console.log('Downloading YDL...');
    request({url: YDL_URL, method: 'get', encoding: null}).on('response', (err, res) => {
      var targetStream = fs.createWriteStream(YDL_BIN_PATH);
      res.pipe(targetStream);
      res.on('end', () => {
        console.log('Downloading YDL: done.');
        done();
      });
    });
  }
};

const ydl = (url, done) => {
  console.log('>>' + url);
  done(null, 'ok?');
};

app.get('/', (req, res) => {
  res.send(page());
});

app.post('/', (req, res) => {
  if (req.body.user !== USER) {
    return res.send(page('Wrong user.'));
  }
  if (req.body.password !== PASSWORD) {
    return res.send(page('Wrong password.'));
  }
  ydl(req.body.url, (err) => {
    if (err) {
      return res.send(page('YDL Error.'));
    } else {
      return res.send(page('Downloade started'));
    }
  });;  
});

checkYDL((err) => {
  app.listen(PORT, () => {
    console.log('nomudo is listening on port ' + PORT);
  });
});

