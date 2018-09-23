/* player.js */
'use strict';

class PlayerApp extends App {
  showMain() {
    this.api('GET', '/api/files', undefined).then(r => {
      const songs = r.body.result.map(file => ({
        url: file,
        name: file.slice('/api/file/'.length, -4),
        artist: '-/-',
        album: '-/-',
        cover_art_url: '/play/img/black-play.svg'
      }));
      
      this.setContent(songs.map((song, index) => (`
        <div class="black-player-song amplitude-song-container amplitude-play-pause" amplitude-song-index="${index}">
          <!--img src="../album-art/soon-it-will-be-cold-enough.jpg"-->
          <div class="song-meta-container">
            <span class="individual-song-name">${song.name}</span>
            <span class="individual-song-artist">${song.artist}</span>
          </div>
        </div>
      `)).join('\n'));
      
      /*$('logout-link').addEventListener('click', () => {
        this.doLogout();
      });*/
      
      Amplitude.init({
        /*"bindings": {
          37: 'prev',
          39: 'next',
          32: 'play_pause'
        },*/
        "songs": songs
        /*
          "name": "Bla",
          "artist": "Emancipator",
          "album": "Soon It Will Be Cold Enough",
          "url": "../songs/Anthem-Emancipator.mp3"
          "cover_art_url": "../album-art/soon-it-will-be-cold-enough.jpg"
        */
      });
    });
  }
}

const app = new PlayerApp('black-player-playlist');

// use https://521dimensions.com/open-source/amplitudejs/docs