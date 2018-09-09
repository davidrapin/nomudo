// client.js

document.onreadystatechange = function () {
  if (document.readyState === "interactive") {
    initApp();
  }
}

function initApp() {
  const app = new App();
  app.refresh();
}

class App {
  refresh() {
    this.api('GET', '/api/auth/me', undefined).then(r => {
      if (r.ok) {
        this.user = r.body;
        return this.showDashboard();
      } else {
        this.user = null;
        return this.showLogin();
      }
    });
  }
  
  showLogin() {
    this.setContent(`
      <form id="login">
        <label for="username">Username</label>
        <input type="text" id="username" />
        <label for="pasword">Password</label>
        <input type="password" id="password" />
        <button id="login-button">Login</button>
      </form>
    `);
    $('login').addEventListener('submit', (e) => {
      e.preventDefault();
      this.doLogin($('username').value, $('password').value);
      return false;
    }, false);
  }
  
  doLogin(username, password) {
    const data = {
      username: username, 
      password: password
    };
    return this.api('POST', '/api/auth/login', data).then(r => {
      if (r.ok) {
        return this.refresh();
      } else {
        alert('wrong credentials');
      }
    });
  }
  
  doLogout() {
    return this.api('POST', '/api/auth/logout', {}).then(r => {
      return this.refresh();
    });
  }
  
  showDashboard() {
    this.setContent(`
      <div class="links">
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
    $('download').addEventListener('submit', (e) => {
      e.preventDefault();
      this.doDownload($('url').value);
      return false;
    }, false);
    $('update-link').addEventListener('click', () => {
      this.doUpdate();
    });
    $('logout-link').addEventListener('click', () => {
      this.doLogout();
    });
    $('.retry-link').forEach(link => {
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
    const link = $('update-link');
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
  
  api(verb, url, data) {
    return fetch(url, {
      method: verb, // *GET, POST, PUT, DELETE, etc.
      mode: 'same-origin', // no-cors, cors, *same-origin
      cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
      credentials: 'same-origin', // include, same-origin, *omit
      headers: {
        "Content-Type": "application/json; charset=utf-8",
          // "Content-Type": "application/x-www-form-urlencoded",
      },
      redirect: "follow", // manual, *follow, error
      referrer: "no-referrer", // no-referrer, *client
      body: JSON.stringify(data), // body data type must match "Content-Type" header
    }).then(response => {
      // response.status === 204 ? undefined : 
      return response.text().then(text => {
        let json = null;
        let ok = response.ok;
        let status = response.status;
        
        if (status !== 204 && text.length > 0) {
          try {
            json = JSON.parse(text);
          } catch(e) {
            ok = false;
            status = 501;
            json = {error: 'unexpected text: ' + text};
          }
        }
        
        return {
          ok: ok,
          status: status,
          body: json
        };
      });
    });
  }
  
  setContent(html) {
    $('content').innerHTML = html;
  }
}

function $(idOrClass) {
  if (idOrClass.indexOf('.') === 0) {
    let c = document.getElementsByClassName(idOrClass.substr(1));
    c.forEach = Array.prototype.forEach;
    return c;
  } else {
    return document.getElementById(idOrClass);
  }
}


// use https://521dimensions.com/open-source/amplitudejs/docs