/* app.js */
'use strict';

class App {

  constructor(contentId) {
    if (!contentId) {
      contentId = 'content';
    }
    this.contentId = contentId;
  
    document.onreadystatechange = () => {
      if (document.readyState === "interactive") {
      
        if (!window._) {
          window._ = function _(idOrClass) {
            if (idOrClass.indexOf('.') === 0) {
              let c = document.getElementsByClassName(idOrClass.substr(1));
              c.forEach = Array.prototype.forEach;
              return c;
            } else {
              return document.getElementById(idOrClass);
            }
          };
        }
      
        this.refresh();
      }
    }
  }

  refresh() {
    this.api('GET', '/api/auth/me', undefined).then(r => {
      if (r.ok) {
        this.user = r.body;
        return this.showMain();
      } else {
        this.user = null;
        return this.showLogin();
      }
    });
  }
  
  showMain() {
    this.setContent('overwrite App.showMain');
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
    _('login').addEventListener('submit', (e) => {
      e.preventDefault();
      this.doLogin(_('username').value, _('password').value);
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
    _(this.contentId).innerHTML = html;
  }
}
