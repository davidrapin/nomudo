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

const FILENAME_RE = /\n\[download\] Destination: ([^\r\n]+)/;

class Job {

  constructor(url, target) {
    this.running = false;
    this.start = null;
    this.end = null;
    this.progress = 'starting';
    this.out = '';
    this.err = '';
    this.url = url;
    this.target = target;
  }
  
  get url() {
    return this._url;
  }
  
  set url(url) {
    // Remove the youtube Playlist parameter:
    // avoids downloading the whole playlist
    this._url = url ? url.replace(/&list=[^&]+/, '') : url;
  }
  
  get out() {
    // if finished AND filename found: no out needed anymore
    if (!this.running && this.filename) {
      return '';
    }
    return this._out;
  }
  
  set out(out) {
    this._out = out;
  }
  
  doStart() {
    Utils.log(`Starting job (${this.url} --> ${this.target})`);
    this.running = true;
    this.start = Date.now();
    //this.promise = promise;
  }
  
  doFinish(err, out) {
    Utils.log(`Done: ${this.url}`);
    this.running = false;
    this.end = Date.now();
    this.out = out;
    this.err = err;
    this._extractFilename();
    //this.promise = undefined;
    if (err) {
      this.progress = 'failure';
    } else {
      this.progress = 'success';
    }
  }
  
  _extractFilename() {
    if (!this.out) { return; }
    const m = this.out.match(FILENAME_RE);
    if (m) {
      this.filename = path.relative(this.target, m[1]);
    }
  }
  
  asPublic() {
    this._extractFilename();
    return {
      start: this.start,
      end: this.end,
      running: this.running,
      out: this.out,
      err: this.err,
      url: this.url,
      target: this.target,
      progress: this.progress,
      filename: this.filename
    };
  }

  static parse(job) {
    var j = new Job();
    Object.keys(job).forEach(k => {
      j[k] = job[k];
    });
    
    // job serialized while in progress
    if (j.running === true) {
      j.running = false;
      j.progress = 'failure';
      j.end = Date.now();
    }
    return j;
  }
}

class Ydl {

  parseJob(job) {
    return Job.parse(job);
  }

  /**
   * @param {string} binPath
   * @param {string[]} binArgs
   * @param {function} done
   * @param {function(err, out)} [progress]
   */
  runBin(binPath, binArgs, done, progress) {
    var child = spawn(binPath, binArgs);
    var out = '', err = '';
    
    const emitProgress = (err, out) => {
      if (typeof progress === 'function') {
        progress(err, out);
      }
    };
    
    child.stdout.on('data', (data) => {
      out += data;
      emitProgress(err, out);
    });
    
    child.stderr.on('data', (data) => {
      err += data;
      emitProgress(err, out);
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
    return this.checkYDL().then(() => {
      return this.checkFFMPEG();
    });
  }
  
  /**
   * @returns {Promise}
   */
  checkYDL() {
    return new Promise((resolve, reject) => {
      try {
        //fs.ensureDirSync(DOWNLOAD_PATH);
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
  checkFFMPEG() {
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
    if (this.updateP) {
      return this.updateP;
    }
    this.updateP = this._update().finally(() => {
      this.updateP = undefined;
    });
    return this.updateP;
  }
  
  _update() {
    Utils.log('Updating binary');
    return new Promise((resolve, reject) => {
      this.runBin(YDL_BIN_PATH, ['-U'], (err) => {
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
    const job = new Job(url, targetFolder);
    
    const jobPromise = new Promise((resolve, reject) => {
      this.runBin(YDL_BIN_PATH, [
        '--no-color', 
        '-o', path.resolve(targetFolder, '_%(title)s.%(ext)s'),
        '-f', 'mp3/mp4/aac/bestaudio',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--ffmpeg-location', FFMPEG_PATH,
        job.url
      ], 
      // done
      (err, out) => {
      
        job.doFinish(err, out);
        resolve();
      
      },
      // progress
      (err, out) => {
        job.out = out;
        job.err = err;
        
        // match "XXX.XX%" progression strings
        const r = /.*\s(\d{1,3}(?:\.\d{1,2})?%).*/g;
        let m, p = null;
        while (m = r.exec(out)) { p = m[1]; }
        if (p != null) {
          job.progress = p;
        }
      });
    });
    
    job.doStart(jobPromise);
    return job;
  }

}

module.exports = new Ydl();
