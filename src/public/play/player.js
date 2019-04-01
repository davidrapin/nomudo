/* player.js */
'use strict';

function scompare(s1, s2) {
  s1 = s1.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s2 = s2.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return s1.toLowerCase() === s2.toLowerCase() 
    ? 0 
    : (s1.toLowerCase() > s2.toLowerCase() ? 1 : -1);
}

class PlayerApp extends App {
  showMain() {
    this.api('GET', '/api/files', undefined).then(r => {
      const songs = r.body.result.map(file => {
        const n = file.slice('/api/file/'.length, -4).split('/');
        const name = (n.length > 1 ? n.slice(0, -1).join(' / ') + ' / ' : '') + n[n.length - 1].replace(/^_/, '')
      
        return {
          url: file.split('/').map(s => encodeURIComponent(s)).join('/'),
          name: name,
          artist: '-/-',
          album: n.length > 1 ? n[0] : 'z/z',
          cover_art_url: '/play/img/black-play.svg'
        };
      });
      
      songs.sort((s1, s2) => {
        const c = scompare(s1.album, s2.album);
        return c !== 0 ? c : scompare(s1.name, s2.name);
      });
      
      this.setContent(songs.map((song, index) => (`
        <div class="black-player-song amplitude-song-container amplitude-play-pause" amplitude-song-index="${index}">
          <!--img src="../album-art/soon-it-will-be-cold-enough.jpg"-->
          <div class="song-meta-container">
            <span class="individual-song-name">${song.name}</span>
            <!--span class="individual-song-artist">${song.artist}</span-->
          </div>
        </div>
      `)).join('\n'));
      
      Amplitude.init({
        "songs": songs
        /*
          "name": "Bla",
          "artist": "Emancipator",
          "album": "Soon It Will Be Cold Enough",
          "url": "../songs/Anthem-Emancipator.mp3"
          "cover_art_url": "../album-art/soon-it-will-be-cold-enough.jpg"
        */
      });
      
      document.addEventListener('keydown', (event) => {
        //console.log('event.ctrlKey:' + event.ctrlKey + ' code:' + event.code);
        if (event.code === 'ArrowLeft') {
          if (event.ctrlKey) {
            this.skipTo(-10);
          } else {
            Amplitude.prev();
          }
        } else if (event.code === 'ArrowRight') {
          if (event.ctrlKey) {
            this.skipTo(10);
          } else {
            Amplitude.next();
          }
        } else if (event.code === 'Space') {
          event.preventDefault();
          if (Amplitude.audio().paused) {
            Amplitude.play();
          } else {
            Amplitude.pause();
          }
          return false;
        }
      }, false);
    });
  }
  
  skipTo(offset) {
    let newSeconds = Amplitude.getSongPlayedSeconds() + offset;
    const duration = Amplitude.getSongDuration();
    
    if (newSeconds < 0) { 
      newSeconds = 0; 
    } else if (newSeconds > duration) { 
      newSeconds = duration - 0.5;
    }
    const newPercent = newSeconds / duration;
    Amplitude.setSongPlayedPercentage(newPercent * 100);
  }
}

const app = new PlayerApp('black-player-playlist');

// use https://521dimensions.com/open-source/amplitudejs/docs