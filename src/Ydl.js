'use strict';

const Promise = require('bluebird');
const request = require('request');
const spawn = require('child_process').spawn;
const path = require('path');
const fs = require('fs-extra');

const Utils = require('./utils');

const YDL_URL = 'https://yt-dl.org/downloads/latest/youtube-dl';
const YDL_PATH = path.resolve(__dirname, '..', 'ydl');
const YDL_BIN_PATH = path.resolve(__dirname, '..', 'ydl', 'youtube-dl');

const FFMPEG_PATH = path.resolve(__dirname, '..', 'ffmpeg-3.1.1-64bit-static');
const FFMPEG_URL = 'http://johnvansickle.com/ffmpeg/releases/ffmpeg-release-64bit-static.tar.xz';
const FFMPEG_ARCHIVE = path.resolve(__dirname, '..', 'ffmpeg.tar.xz');

class Job {

  constructor() {
    this.running = false;
    this.start = null;
    this.end = null;
    this.progress = 'starting';
    this.out = '';
    this.err = '';
  }
  
  start() {
    this.running = true;
    this.start = Date.now();
  }
  
  finish(err, out) {
    this.running = false;
    this.end = Date.now();
    this.out = out;
    this.err = err;
    if (err) {
      this.progress = 'failure';
    } else {
      this.progress = 'success';
    }
  }
}

class DownloadJob extends Job {

  constructor(url) {
    super();
    this.url = url;
  }
  
}

class Ydl {

  /**
   * @param {string} binPath
   * @param {string[]} binArgs
   * @param {function} done
   * @param {function} [progress]
   */
  runBin(binPath, binArgs, done, progress) {
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
  
  /**
   * @returns {Promise}
   */
  check() {
    return checkYDL().then(() => {
      return checkFFMPEG();
    });
  }
  
  /**
   * @returns {Promise}
   */
  checkYDL {
    return new Promise((resolve, reject) => {
      try {
        fs.ensureDirSync(DOWNLOAD_PATH);
        fs.ensureDirSync(YDL_PATH);
      } catch(e) {
        return reject(e);
      }

      try {
        var stat = fs.statSync(YDL_BIN_PATH);
        if (stat.size === 0) {
          throw new Error('file is empty');
        }
        return resolve();
      } catch(e) {
        console.log('Downloading YDL...');
        request({url: YDL_URL, method: 'get', encoding: null}).on('response', (res) => {
          var targetStream = fs.createWriteStream(YDL_BIN_PATH);
          res.pipe(targetStream);
          res.on('end', () => {
            console.log(`Downloading YDL: done (size: ${res.headers['content-length']})`);
            fs.chmodSync(YDL_BIN_PATH, '755');
            resolve();
          });
        });
      }
    }).catch(err => {
      return Promise.reject(new Error('Could not install YDL: ' + err));
    });
  }

  /**
   * @returns {Promise}
   */
  checkFFMPEG {
    //fs.ensureDirSync(FFMPEG_PATH);
    return new Promise((resolve, reject) => {
      try {
        fs.statSync(FFMPEG_PATH);
        resolve();
      } catch(e) {
        Utils.log('Downloading FFMPEG...');
        request({url: FFMPEG_URL, method: 'get', encoding: null}).on('response', (res) => {
          var targetStream = fs.createWriteStream(FFMPEG_ARCHIVE);
          res.pipe(targetStream);
          res.on('end', () => {
            Utils.log(`Downloading FFMPEG: done (size: ${res.headers['content-length']})`);
            
            Utils.log('Unpacking FFMPEG...');
            var child = spawn('tar', ['-xJf', FFMPEG_ARCHIVE]);
            var out = '', err = '';
            child.stdout.on('data', (data) => { out += data; });
            child.stderr.on('data', (data) => { err += data; });
            
            child.on('close', (code) => {
              if (err !== '') {
                reject(err);
              } else {
                Utils.log('Unpacking FFMPEG... done.');
                resolve();
              }
            });
          });
        });
      }
    }).catch(err => {
      return Promise.reject(new Error('Could not install FFMPEG: ' + err));
    });;
  }
  
  update() {
    console.log('Updating binary');
    return new Promise((resolve, reject) => {
      runBin(YDL_BIN_PATH, ['-U'], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
  
  download(url, targetFolder) {
    // let conflict = state.jobs.get(url);
    // if (conflict && conflict.running) {
    //  throw new Error(`Job already running: "${url}`);
    // }
    const job = new DownloadJob(url);
    job.start();
    
    return new Promise((resolve, reject) => {
      this.runBin(YDL_BIN_PATH, [
        '--no-color', 
        '-o', path.resolve(targetFolder, '_%(title)s.%(ext)s'),
        '-f', 'mp3/mp4/aac/bestaudio',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--ffmpeg-location', FFMPEG_PATH,
        url
      ], (err, out) => {
      
        job.finish(err, out);
        resolve();
      
      }, (progress) => {
        //Utils.log(url + ' =progress=> ' + progress);
        job.progress = progress;
      });
    });
  }

}

module.exports = new Ydl();
