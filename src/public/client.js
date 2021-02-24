/* client.js */
'use strict';

class DownloaderApp extends App {

  showMain() {
    this.setContent(`
      <div class="links">
        <a href="/play">&#x25B6; play</a> | 
        <a href="javascript:void(0)" id="update-link">update</a> | 
        <a href="javascript:void(0)" id="logout-link">logout (${this.user.username})</a>
      </div>
      
      <form id="download">
        <label for="url">URL</label>
        <input type="text" id="url" />
        <button id="download-button">Download</button>
      </form>
      
      ${this.jobs(this.user.jobs)}
    `);
    _('download').addEventListener('submit', (e) => {
      e.preventDefault();
      this.doDownload(_('url').value);
      return false;
    }, false);
    _('update-link').addEventListener('click', () => {
      this.doUpdate();
    });
    _('logout-link').addEventListener('click', () => {
      this.doLogout();
    });
    _('.retry-link').forEach(link => {
      link.addEventListener('click', () => {
        //console.log('retry: ' + link.dataset.url);
        this.doDownload(link.dataset.url);
      });
    });
  }
  
  doDownload(url) {
    const data = {
      url: url
    };
    return this.api('POST', '/api/ydl/download', data).then(r => {
      if (r.ok) {
        return this.refresh();
      } else {
        if (r.status === 401) {
          alert('auth required');
          return this.refresh();
        } else {
          alert('error: ' + r.body.error);
        }
      }
    });
  }
  
  doUpdate() {
    const link = _('update-link');
    const orgText = link.innerText;
    link.innerText = 'Updating...';
    
    return this.api('POST', '/api/ydl/update', {}).then(r => {
      if (r.ok) {
        link.innerText = 'Updated!';
        setTimeout(() => link.innerText = orgText, 1000);
        
      } else {
        link.innerText = 'Error!';
        setTimeout(() => link.innerText = orgText, 1000);
        
        if (r.status === 401) {
          alert('auth required');
          return this.refresh();
        } else {
          alert('error: ' + r.body.error);
        }
      }
    });
  }
  
  jobs(jobs) {
    return jobs.reverse().map(j => `
      <div class="job">
        <div class="line">
          <div class="w20">
            <span class="date">${new Date(j.start).toISOString().substr(0, 19).replace('T', ' ')}</span>
            <span class="progress ${!j.running ? j.progress : ''}">${j.progress}</span>
            ${j.progress === 'failure' ? '<a class="retry-link" href="javascript:void(0)" data-url="' + j.url + '">retry</a>' : ''}
          </div>
          <div class="w80">
            <span class="name">${j.filename ? j.filename : '--'}</span>
            <span class="url"><a href="${j.url}">${j.url}</a></span>
          </div>
        </div>
        ${j.running ? '<div class="line out">' + (j.err ? j.err : j.out) + '</div>' : ''} 
      </div>
    `).join('\n\n');
  }
  
}

const app = new DownloaderApp();
