/*
 * Mondes de la chambre.
 *
 * Tous les mondes partagent la même disposition (postes, obstacles, chemins) :
 * seul l'habillage change, ce qui permet de basculer de monde en direct.
 *
 * Emplacements à respecter (pixels du monde, 320×208) :
 *   planification   x 10–86,  y 4–32   (tableau / partition / plan du potager)
 *   lecture         x 220–314, y 4–46  (bibliothèque, serre, aquarium…)
 *   grande déco     x 106–122, y 22–48
 *   bureau Claude   x 126–194, y 76–108 (Claude assis en (160, 92))
 *   4 postes "code" CODE_DESKS[i] = {x,y}, plateau 36×12, objet au-dessus en y-9
 *   banc de test    x 4–80,   y 133–172 (voyants en x 18/42/66), colonne x 4–13, y 176–198
 *   salon           dossier x 236–300 y 128–148, lampe x 226–238 y 114–150,
 *                   table x 252–284 y 164–174, meuble x 288–318 y 158–206
 *   mascotte        x 206–230, y 168–184
 *
 * Pour ajouter un monde : ajoute une fabrique dans ROOM_WORLDS qui renvoie
 * { id, name, icon, claudeTitle, glyphs, status, background, top, board, props, lighting }.
 */
(function (root) {
  'use strict';

  /* ================================================================
   * OPÉRA
   * ================================================================ */
  function opera(api) {
    const { px, shade, rgba, hash, roundRect, glow, g } = api;
    const GOLD = '#c9a24a', GOLD_HI = '#ecd28a', VELVET = '#8e1b2e', VELVET_DK = '#6a1121', VELVET_HI = '#b33048';

    function background(c, rand) {
      // moquette de salle
      px(c, 0, 36, 320, 172, '#4a1825');
      for (let y = 38; y < 208; y += 8) for (let x = ((y - 38) / 8) % 2 ? 0 : 4; x < 320; x += 8) {
        px(c, x, y, 1, 1, '#6a2635'); px(c, x + 2, y + 2, 1, 1, '#5a1e2c');
      }
      // mur du fond et scène
      px(c, 0, 0, 320, 36, '#1b0b13');
      px(c, 118, 4, 84, 20, '#141a3d');
      px(c, 118, 18, 84, 6, '#1d2552');
      px(c, 118, 24, 84, 10, '#6b4528');
      for (let x = 118; x < 202; x += 7) px(c, x, 24, 1, 10, '#5a391f');
      px(c, 118, 24, 84, 1, '#8a5c36');
      // rideaux
      const curtain = (x0, w) => {
        px(c, x0, 3, w, 31, VELVET);
        for (let x = x0; x < x0 + w; x += 4) { px(c, x, 3, 1, 31, VELVET_DK); px(c, x + 2, 3, 1, 31, VELVET_HI); }
      };
      curtain(88, 30); curtain(202, 16);
      px(c, 86, 2, 134, 5, '#a11f35');
      for (let x = 86; x < 220; x += 6) px(c, x + 1, 7, 4, 1, '#a11f35');
      px(c, 116, 8, 2, 26, GOLD); px(c, 202, 8, 2, 26, GOLD);
      // cadre doré
      px(c, 0, 0, 320, 2, '#9c7426'); px(c, 0, 2, 320, 1, GOLD_HI);
      px(c, 0, 33, 320, 3, GOLD); px(c, 0, 33, 320, 1, GOLD_HI);
      px(c, 0, 36, 320, 3, 'rgba(0,0,0,0.35)');
      // grande partition sur chevalet (planification)
      px(c, 20, 30, 2, 8, '#4a2a14'); px(c, 74, 30, 2, 8, '#4a2a14');
      px(c, 10, 4, 76, 26, GOLD); px(c, 11, 5, 74, 24, '#9c7426');
      px(c, 12, 6, 72, 22, '#f3e8cc');
      for (const sy of [9, 19]) for (let i = 0; i < 5; i++) px(c, 14, sy + i * 2, 68, 1, '#c6b088');
      px(c, 15, 8, 2, 10, '#3a2a1a'); px(c, 14, 10, 4, 1, '#3a2a1a'); px(c, 14, 14, 4, 1, '#3a2a1a');
      // armoire à partitions
      px(c, 220, 4, 52, 40, '#4a2a18'); px(c, 222, 6, 48, 36, '#2a160c');
      for (let s = 0; s < 4; s++) {
        const sy = 6 + s * 9;
        px(c, 222, sy + 8, 48, 1, '#5e3a22');
        let x = 224;
        while (x < 266) {
          if (rand() < 0.45) {
            px(c, x, sy + 4, 6, 4, '#efe2c2'); px(c, x, sy + 4, 6, 1, '#fff4d8');
            px(c, x + 2, sy + 4, 1, 4, ['#a11f35', '#2e5aa8', GOLD, '#2c7a4b'][Math.floor(rand() * 4)]);
            x += 7;
          } else {
            const h = 3 + Math.floor(rand() * 3);
            px(c, x, sy + 8 - h, 7, h, '#e6d6b0');
            for (let k = 0; k < h; k += 1) px(c, x, sy + 8 - h + k, 7, 1, k % 2 ? '#d8c6a0' : '#efe2c2');
            x += 8;
          }
        }
      }
      // orgue
      px(c, 274, 30, 40, 15, '#4a2a18'); px(c, 274, 30, 40, 1, '#6e4528');
      px(c, 280, 34, 28, 3, '#efe6d6'); for (let k = 0; k < 7; k++) px(c, 281 + k * 4, 34, 1, 2, '#1a1a1a');
      for (let i = 0; i < 10; i++) {
        const top = 6 + Math.round(Math.abs(i - 4.5) * 2.2);
        px(c, 275 + i * 4, top, 3, 30 - top, GOLD);
        px(c, 275 + i * 4, top, 1, 30 - top, GOLD_HI);
        px(c, 275 + i * 4, top + 4, 3, 1, '#2a160c');
      }
      // tapis sous le podium et au salon
      roundRect(c, 102, 76, 116, 46, '#5e1826'); roundRect(c, 105, 79, 110, 40, '#741f30');
      for (let x = 108; x < 212; x += 5) { px(c, x, 81, 2, 1, GOLD); px(c, x + 2, 116, 2, 1, GOLD); }
      roundRect(c, 232, 142, 76, 50, '#2a1638'); roundRect(c, 235, 145, 70, 44, '#3a1f4d');
      for (let y = 148; y < 188; y += 6) px(c, 238, y, 64, 1, '#4a2a60');
    }

    function top(t) {
      for (let i = 0; i < 12; i++) {
        if ((hash(i + Math.floor(t / 600)) % 4) === 0) continue;
        px(g, 119 + (hash(i * 5) % 82), 5 + (hash(i * 3) % 12), 1, 1, '#e9e3ff');
      }
      px(g, 184, 7, 6, 6, '#f6f0d0'); px(g, 186, 7, 4, 4, '#d8d0b0');
      // projecteurs suspendus
      for (let x = 8, i = 0; x < 316; x += 26, i++) {
        px(g, x, 0, 5, 3, '#1a1a1a');
        const on = (Math.sin(t / 700 + i) + 1) / 2 > 0.3;
        px(g, x + 1, 3, 3, 1, on ? '#ffe6a8' : '#5a4a2a');
      }
      // l'orgue scintille quand on y lit
      if (api.anyReading()) {
        const k = Math.floor(t / 110) % 10;
        g.fillStyle = 'rgba(255,240,190,0.55)'; g.fillRect(275 + k * 4, 6, 3, 24);
      }
      for (const a of api.readers()) {
        if (a.slot > 1) continue;
        const sy = 6 + (Math.floor(t / 1800 + a.slot) % 4) * 9;
        px(g, Math.round(a.x) - 3, sy + 5, 6, 3, '#fff4d8');
        px(g, Math.round(a.x) - 1, sy + 5, 1, 3, a.color);
      }
    }

    function board(t, strokes) {
      for (const s of strokes) {
        const p = Math.min(1, (t - s.t0) / 500);
        const staff = s.y < 17 ? 9 : 19;
        const ny = staff + ((s.y * 7 + s.x) % 9);
        px(g, s.x, ny, 2, 2, s.color);
        if (p > 0.3) px(g, s.x + 1, ny - 4, 1, 4, '#2a1a10');
        if ((s.k === 'box' || s.k === 'arrow') && p > 0.7) {
          const x2 = s.x + 4, y2 = staff + ((s.y * 3 + s.x) % 9);
          px(g, x2, y2, 2, 2, s.color); px(g, x2 + 1, y2 - 4, 1, 4, '#2a1a10');
          px(g, s.x + 1, Math.min(ny, y2) - 4, 5, 1, '#2a1a10');
        }
      }
    }

    function candles(x, y, t, n = 3) {
      for (let i = 0; i < n; i++) {
        const cx = x + i * 4;
        px(g, cx, y, 2, 4, '#f3ead6');
        const fl = hash(i + Math.floor(t / 90)) % 2;
        px(g, cx, y - 2 - fl, 2, 2, '#ffb347'); px(g, cx, y - 1, 1, 1, '#fff2b0');
      }
    }

    function props(t) {
      const list = [];
      // candélabre
      list.push({ y: 48, draw: () => {
        px(g, 110, 44, 10, 4, GOLD); px(g, 114, 30, 2, 14, GOLD);
        px(g, 108, 30, 14, 2, GOLD); px(g, 108, 28, 2, 2, GOLD); px(g, 120, 28, 2, 2, GOLD);
        candles(108, 24, t);
      } });
      // podium du chef
      list.push({ y: 108, draw: () => {
        px(g, 130, 86, 60, 8, '#5a3322'); px(g, 130, 86, 60, 1, GOLD);
        px(g, 130, 94, 60, 12, '#3a2016'); px(g, 130, 94, 60, 1, GOLD);
        for (let x = 134; x < 188; x += 9) px(g, x, 97, 5, 6, '#2e190f');
        px(g, 138, 106, 44, 2, 'rgba(0,0,0,0.35)');
        // pupitre avec partition
        px(g, 145, 82, 2, 6, '#1a1a1a'); px(g, 139, 76, 14, 7, '#1a1a1a'); px(g, 140, 77, 12, 5, '#f3e8cc');
        for (let k = 0; k < 3; k++) px(g, 141, 78 + k * 2, 10, 1, '#c6b088');
        // verre d'eau et partitions reçues
        px(g, 185, 82, 3, 5, 'rgba(200,235,255,0.75)'); px(g, 185, 82, 3, 1, '#ffffff');
        for (let i = 0; i < api.deskPile(); i++) { px(g, 176, 86 - i, 8, 2, i % 2 ? '#efe2c2' : '#e2d2ac'); px(g, 176, 86 - i, 8, 1, '#fff4d8'); }
        // baguette
        const ang = api.mainActive() ? -0.6 + Math.sin(t / 140) * 0.9 : -0.9;
        for (let r = 0; r < 8; r++) px(g, Math.round(165 + Math.cos(ang) * r), Math.round(87 + Math.sin(ang) * r), 1, 1, r < 2 ? '#3a2a1a' : '#f6f2ea');
        px(g, 151, 99, 18, 5, '#2a160e'); px(g, 152, 100, 16, 3, GOLD);
      } });
      // musiciens
      const instruments = [
        (x, y) => { px(g, x, y + 1, 5, 3, '#8a4a22'); px(g, x + 5, y + 2, 4, 1, '#3a2010'); px(g, x + 1, y + 2, 3, 1, '#a8642e'); },
        (x, y) => { px(g, x + 1, y - 8, 5, 10, '#8a4a22'); px(g, x + 3, y - 12, 1, 4, '#2a160c'); px(g, x + 2, y - 5, 3, 1, '#2a160c'); px(g, x + 3, y + 2, 1, 2, '#555'); },
        (x, y) => { px(g, x, y + 2, 7, 1, GOLD); px(g, x + 6, y, 3, 4, GOLD); px(g, x + 2, y + 1, 1, 1, GOLD_HI); px(g, x + 4, y + 1, 1, 1, GOLD_HI); },
        (x, y) => { px(g, x + 1, y - 10, 1, 13, GOLD); px(g, x + 1, y - 10, 6, 1, GOLD); px(g, x + 6, y - 10, 1, 13, GOLD); for (let k = 0; k < 4; k++) px(g, x + 2 + k, y - 9 + k, 1, 11 - k, 'rgba(240,230,200,0.6)'); }
      ];
      api.CODE_DESKS.forEach((d, i) => list.push({ y: d.y + 12, draw: () => {
        const user = api.codeUser(i);
        px(g, d.x + 13, d.y + 17, 10, 5, VELVET); px(g, d.x + 13, d.y + 17, 10, 1, VELVET_HI); px(g, d.x + 17, d.y + 22, 2, 2, '#2a1a10');
        px(g, d.x, d.y, 36, 3, '#5a3322'); px(g, d.x, d.y, 36, 1, GOLD);
        px(g, d.x, d.y + 3, 36, 9, '#3a2016'); px(g, d.x, d.y + 12, 36, 1, 'rgba(0,0,0,0.3)');
        px(g, d.x + 17, d.y - 1, 2, 4, '#1a1a1a');
        px(g, d.x + 11, d.y - 9, 14, 8, '#1a1a1a');
        px(g, d.x + 12, d.y - 8, 12, 6, user ? '#fff6dc' : '#d8ccb0');
        for (let k = 0; k < 3; k++) px(g, d.x + 13, d.y - 7 + k * 2, 10, 1, '#b9a37a');
        if (user) {
          const k = Math.floor(t / 200) % 10;
          px(g, d.x + 13 + k, d.y - 7 + (k % 3) * 2, 1, 1, '#2a1a10');
          g.fillStyle = rgba(user.color, 0.16); g.fillRect(d.x + 7, d.y - 12, 22, 16);
        }
        const shake = user && Math.floor(t / 120) % 2 ? 1 : 0;
        instruments[i % 4](d.x + 27, d.y - shake);
      } }));
      // régie son & lumière
      list.push({ y: 172, draw: () => {
        const running = api.benchRunning();
        px(g, 4, 152, 76, 6, '#2b2b34'); px(g, 4, 152, 76, 1, '#4a4a58');
        px(g, 4, 158, 76, 12, '#1e1e26'); px(g, 4, 170, 76, 2, 'rgba(0,0,0,0.3)');
        for (let i = 0; i < 17; i++) {
          const x = 7 + i * 4;
          px(g, x, 153, 1, 4, '#0c0c10');
          const ky = 153 + (running ? hash(i + Math.floor(t / 140)) % 4 : 2);
          px(g, x - 1, ky, 3, 1, i % 4 ? '#d8d8e0' : '#ff6b6b');
        }
        // vumètres
        px(g, 7, 140, 22, 13, '#22222a'); px(g, 9, 142, 18, 9, '#0a0a0e');
        for (let b = 0; b < 6; b++) {
          const h = running ? 2 + hash(b + Math.floor(t / 90)) % 7 : 1 + (b % 2);
          for (let k = 0; k < h; k++) px(g, 10 + b * 3, 150 - k, 2, 1, k > 5 ? '#ff4d5e' : k > 3 ? '#ffd166' : '#57f287');
        }
        // écran forme d'onde
        px(g, 31, 138, 22, 15, '#22222a'); px(g, 33, 140, 18, 10, '#07101c');
        for (let x = 0; x < 18; x++) px(g, 33 + x, Math.round(145 + Math.sin(x * 0.8 + t / (running ? 90 : 400)) * (running ? 3 : 1)), 1, 1, '#5ef1ff');
        // projecteur
        px(g, 57, 146, 18, 7, '#30343f'); px(g, 62, 140, 9, 7, '#1a1c22'); px(g, 70, 141, 3, 5, running ? '#fff2b0' : '#5a5a3a');
        if (running) { g.fillStyle = 'rgba(255,240,180,0.12)'; g.fillRect(73, 136, 10, 12); }
        api.drawBenchLamps(t);
        // enceinte
        px(g, 4, 176, 9, 22, '#141418'); px(g, 5, 179, 7, 7, '#2a2a30'); px(g, 7, 181, 3, 3, '#0a0a0c'); px(g, 6, 189, 5, 5, '#2a2a30'); px(g, 7, 190, 3, 3, '#0a0a0c');
      } });
      // loge VIP
      list.push({ y: 141, draw: () => {
        px(g, 236, 128, 64, 10, VELVET); px(g, 236, 128, 64, 1, VELVET_HI);
        for (let x = 242; x < 298; x += 8) px(g, x, 132, 1, 1, GOLD);
        px(g, 238, 138, 60, 9, '#a52a40'); px(g, 238, 138, 60, 1, '#c24660');
        px(g, 234, 130, 5, 18, VELVET_DK); px(g, 297, 130, 5, 18, VELVET_DK);
        px(g, 234, 130, 5, 1, GOLD); px(g, 297, 130, 5, 1, GOLD);
        px(g, 238, 147, 60, 2, '#4a0c18');
      } });
      list.push({ y: 150, draw: () => {
        px(g, 229, 147, 6, 3, GOLD); px(g, 231, 124, 2, 24, GOLD);
        px(g, 226, 124, 12, 2, GOLD); candles(226, 119, t);
      } });
      list.push({ y: 174, draw: () => {
        px(g, 252, 164, 32, 8, '#efe6dc'); px(g, 252, 171, 32, 2, '#d8cfc2');
        px(g, 262, 157, 3, 8, '#1f4d2b'); px(g, 262, 157, 3, 2, GOLD);
        px(g, 270, 162, 1, 3, 'rgba(255,240,190,0.85)'); px(g, 274, 162, 1, 3, 'rgba(255,240,190,0.85)');
        px(g, 270, 165, 1, 1, '#e0e0e0'); px(g, 274, 165, 1, 1, '#e0e0e0');
      } });
      list.push({ y: 205, draw: () => {
        px(g, 288, 174, 30, 32, '#3a2016'); px(g, 288, 174, 30, 2, GOLD);
        px(g, 293, 160, 22, 14, '#2a160c');
        ['#1f4d2b', '#7a1c2a', '#d9b45a', '#2e5aa8', '#1f4d2b'].forEach((col, k) => { px(g, 295 + k * 4, 163, 2, 9, col); px(g, 295 + k * 4, 162, 2, 1, GOLD); });
        px(g, 300, 178, 8, 6, '#c7ccd6'); px(g, 300, 178, 8, 1, '#eef1f6'); px(g, 302, 174, 2, 5, '#1f4d2b');
      } });
      // chat noir sur coussin
      list.push({ y: 182, draw: () => {
        const x = 212, y = 182, br = Math.round((Math.sin(t / 900) + 1) / 2);
        px(g, x - 2, y - 2, 18, 4, VELVET); px(g, x - 2, y - 2, 18, 1, VELVET_HI);
        px(g, x, y - 6 - br, 10, 4 + br, '#1b1b22'); px(g, x + 8, y - 9, 5, 4, '#1b1b22');
        px(g, x + 8, y - 10, 1, 1, '#1b1b22'); px(g, x + 12, y - 10, 1, 1, '#1b1b22');
        px(g, x + 9, y - 7, 1, 1, '#ffd166'); px(g, x + 11, y - 7, 1, 1, '#ffd166');
        px(g, x - 3, y - 4 + (Math.floor(t / 1600) % 4 === 0 ? -1 : 0), 4, 1, '#1b1b22');
      } });
      return list;
    }

    function lighting(t) {
      api.darken('rgba(22,6,16,0.32)');
      g.save(); g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,236,190,0.06)';
      g.beginPath(); g.moveTo(150, 0); g.lineTo(170, 0); g.lineTo(196, 110); g.lineTo(124, 110); g.closePath(); g.fill();
      glow(160, 90, 42, '#ffe6a8', 0.2);
      glow(160, 18, 40, '#7a8cff', 0.12);
      const f = 1 + Math.sin(t / 110) * 0.05;
      glow(115, 24, 16 * f, '#ffb347', 0.28);
      glow(232, 118, 24 * f, '#ffb347', 0.24);
      glow(300, 168, 20, '#ff6ac1', 0.06);
      if (api.benchRunning()) glow(78, 140, 22, '#fff2b0', 0.1);
      g.restore();
      api.vignette(0.5);
    }

    return {
      id: 'opera', name: 'Opéra', icon: '🎭', claudeTitle: "Chef d'orchestre",
      glyphs: ['♪', '♫', '♩', '♬'],
      status: { coding: 'Joue sa partition', reading: 'Étudie une partition', planning: 'Compose', bash: 'Règle la régie', coffee: 'À la loge', idle: 'À la loge' },
      background, top, board, props, lighting
    };
  }

  /* ================================================================
   * JARDIN
   * ================================================================ */
  function garden(api) {
    const { px, shade, rgba, hash, roundRect, glow, g } = api;

    function background(c, rand) {
      // gazon
      px(c, 0, 36, 320, 172, '#4f8a3c');
      for (let i = 0; i < 900; i++) {
        const x = Math.floor(rand() * 320), y = 36 + Math.floor(rand() * 172);
        px(c, x, y, 1, rand() < 0.5 ? 2 : 1, rand() < 0.5 ? '#5f9c48' : '#447a33');
      }
      for (let i = 0; i < 70; i++) {
        const x = Math.floor(rand() * 320), y = 40 + Math.floor(rand() * 168);
        px(c, x, y, 1, 1, ['#ffffff', '#ffe066', '#ff9ec7', '#c8a2ff'][Math.floor(rand() * 4)]);
      }
      // ciel, haie, clôture
      for (let y = 0; y < 18; y++) px(c, 0, y, 320, 1, y < 6 ? '#7cc8f5' : y < 12 ? '#94d4f8' : '#b2e2fb');
      px(c, 0, 14, 320, 20, '#2f6b2a');
      for (let x = 0; x < 320; x += 6) { px(c, x, 12, 6, 3, '#2f6b2a'); px(c, x + 1, 11, 4, 1, '#2f6b2a'); px(c, x + 2, 13, 3, 2, '#3f8a36'); }
      for (let i = 0; i < 40; i++) px(c, Math.floor(rand() * 320), 15 + Math.floor(rand() * 12), 1, 1, rand() < 0.5 ? '#ff9ec7' : '#ffffff');
      px(c, 0, 27, 320, 2, '#b88b5c'); px(c, 0, 31, 320, 2, '#b88b5c');
      for (let x = 2; x < 320; x += 12) { px(c, x, 24, 3, 12, '#cfa274'); px(c, x, 24, 3, 1, '#e2bb8e'); }
      px(c, 0, 35, 320, 2, 'rgba(0,0,0,0.18)');
      // panneau du plan (planification)
      px(c, 18, 30, 3, 8, '#6e4628'); px(c, 74, 30, 3, 8, '#6e4628');
      px(c, 10, 4, 76, 26, '#8a5a32'); px(c, 12, 6, 72, 22, '#e8d3a8');
      px(c, 12, 6, 72, 1, '#f3e4c0');
      // serre
      px(c, 220, 10, 52, 34, '#e6f0ec');
      px(c, 222, 12, 48, 31, '#bfe6e0');
      for (let i = 0; i < 6; i++) px(c, 222 + i * 8, 12, 1, 31, '#e6f0ec');
      px(c, 222, 26, 48, 1, '#e6f0ec');
      for (let i = 0; i < 26; i++) px(c, 224 + i, 13 + i % 12, 1, 1, 'rgba(255,255,255,0.6)');
      px(c, 218, 8, 56, 3, '#e6f0ec'); px(c, 226, 5, 40, 3, '#e6f0ec'); px(c, 236, 3, 20, 2, '#e6f0ec');
      for (let s = 0; s < 2; s++) {
        const sy = 24 + s * 15;
        px(c, 223, sy, 46, 1, '#8a6a4a');
        for (let k = 0; k < 6; k++) {
          px(c, 225 + k * 7, sy - 3, 4, 3, '#c66b3d');
          px(c, 225 + k * 7, sy - 7, 4, 4, ['#3fa66b', '#2e8a56', '#5cbf6a'][k % 3]);
          if (k % 2) px(c, 226 + k * 7, sy - 8, 2, 1, '#ff6b9e');
        }
      }
      // ruches
      for (let k = 0; k < 2; k++) {
        const x = 278 + k * 18;
        px(c, x - 1, 40, 16, 4, '#6e4628');
        for (let b = 0; b < 3; b++) { px(c, x, 16 + b * 8, 14, 8, b % 2 ? '#f7e08a' : '#f2c94c'); px(c, x, 16 + b * 8, 14, 1, '#fff2b8'); }
        px(c, x - 1, 13, 16, 3, '#b88b5c'); px(c, x + 4, 37, 6, 2, '#3a2a14');
      }
      // terrasse en gravier et nappe de pique-nique
      roundRect(c, 102, 76, 116, 46, '#b3a37e'); roundRect(c, 105, 79, 110, 40, '#c4b48d');
      for (let i = 0; i < 260; i++) px(c, 106 + Math.floor(rand() * 108), 80 + Math.floor(rand() * 38), 1, 1, rand() < 0.5 ? '#a8987a' : '#d6c8a2');
      for (let y = 142; y < 192; y += 4) for (let x = 232; x < 308; x += 4) px(c, x, y, 4, 4, ((x - 232) / 4 + (y - 142) / 4) % 2 ? '#efe9e0' : '#d9534f');
      // terre sous l'établi
      roundRect(c, 2, 168, 80, 8, '#5c7f3a');
    }

    function top(t) {
      for (let i = 0; i < 3; i++) {
        const x = ((i * 130 + t / 300) % 380) - 40, y = 3 + i * 3;
        px(g, x, y, 14, 3, '#ffffff'); px(g, x + 3, y - 2, 8, 2, '#ffffff'); px(g, x + 2, y + 3, 10, 1, '#e4f4ff');
      }
      const pulse = Math.floor(t / 500) % 2;
      px(g, 300, 3, 8, 8, '#ffe066'); px(g, 302, 2, 4, 10, '#ffe066'); px(g, 299, 5, 10, 4, '#ffe066');
      if (pulse) { px(g, 296, 6, 2, 1, '#fff2a8'); px(g, 310, 6, 2, 1, '#fff2a8'); px(g, 303, 0, 1, 1, '#fff2a8'); }
      // abeilles
      const n = api.anyReading() ? 6 : 2;
      for (let i = 0; i < n; i++) {
        const a = t / (500 + i * 70) + i * 2;
        const bx = 293 + Math.cos(a) * (12 + i * 2), by = 26 + Math.sin(a * 1.3) * 10;
        px(g, bx, by, 2, 1, '#ffd23f'); px(g, bx + 1, by, 1, 1, '#1a1a1a');
      }
      // papillons
      for (let i = 0; i < 2; i++) {
        const bx = 60 + i * 150 + Math.sin(t / 1400 + i) * 40, by = 70 + i * 40 + Math.sin(t / 500 + i) * 8;
        const flap = Math.floor(t / 150 + i) % 2;
        const col = i ? '#ff9ec7' : '#ffe066';
        px(g, bx, by, 1, 2, '#2a2a2a'); px(g, bx - 2, by - (flap ? 1 : 0), 2, 2, col); px(g, bx + 1, by - (flap ? 1 : 0), 2, 2, col);
      }
      for (const a of api.readers()) {
        if (a.slot > 1) continue;
        const k = Math.floor(t / 400) % 2;
        px(g, Math.round(a.x) - 1, 18 + k, 3, 2, '#5cbf6a');
      }
    }

    function board(t, strokes) { api.drawStrokes(strokes, t, { color: s => shade(s.color, -0.25), line: '#8a6a4a' }); }

    function props(t) {
      const list = [];
      // tournesol
      list.push({ y: 48, draw: () => {
        const sw = Math.round(Math.sin(t / 1300));
        px(g, 110, 41, 10, 7, '#c66b3d'); px(g, 110, 41, 10, 1, '#e08850');
        px(g, 114, 26, 2, 15, '#3f8a36'); px(g, 110, 33, 4, 2, '#4fa43f'); px(g, 116, 30, 4, 2, '#4fa43f');
        const cx = 115 + sw, cy = 23;
        px(g, cx - 4, cy - 2, 9, 5, '#ffcf33'); px(g, cx - 2, cy - 4, 5, 9, '#ffcf33');
        px(g, cx - 2, cy - 1, 5, 3, '#6b3e1e'); px(g, cx - 1, cy - 2, 3, 5, '#6b3e1e');
      } });
      // table de jardin + parasol
      list.push({ y: 108, draw: () => {
        px(g, 126, 86, 68, 8, '#b07a48');
        for (let x = 126; x < 194; x += 9) px(g, x, 86, 1, 8, '#93633a');
        px(g, 126, 86, 68, 1, '#c9925c');
        px(g, 130, 94, 4, 12, '#8a5a32'); px(g, 186, 94, 4, 12, '#8a5a32');
        px(g, 128, 99, 64, 3, '#9a6a3a'); px(g, 128, 99, 64, 1, '#b07a48');
        px(g, 132, 106, 56, 2, 'rgba(0,0,0,0.25)');
        // limonade, arrosoir, sachets de graines
        px(g, 130, 79, 5, 7, 'rgba(230,240,255,0.8)'); px(g, 130, 82, 5, 4, '#ffe066'); px(g, 135, 81, 1, 3, 'rgba(230,240,255,0.8)');
        px(g, 140, 81, 7, 5, '#3fa66b'); px(g, 147, 80, 4, 1, '#3fa66b'); px(g, 141, 79, 4, 2, '#3fa66b');
        px(g, 168, 84, 4, 3, '#ff9ec7'); px(g, 173, 84, 4, 3, '#ffe066');
        for (let i = 0; i < api.deskPile(); i++) { px(g, 178, 86 - i, 7, 2, i % 2 ? '#c8e6a0' : '#a8d47a'); px(g, 178, 86 - i, 7, 1, '#e2f4c8'); }
        px(g, 186, 82, 3, 5, 'rgba(230,240,255,0.8)'); px(g, 186, 84, 3, 3, '#ffe066');
        // parasol
        px(g, 191, 60, 2, 46, '#e8e0d0');
        for (let x = 128; x < 198; x++) {
          const stripe = Math.floor((x - 128) / 7) % 2 ? '#ffffff' : '#e8504a';
          const h = 9 - Math.round(Math.abs(x - 162) / 9);
          px(g, x, 60 - h + 6, 1, h, stripe);
        }
        for (let x = 128; x < 198; x += 7) px(g, x + 1, 66, 5, 1, '#c03a35');
        px(g, 160, 50, 4, 2, '#e8e0d0');
        if (api.mainActive()) { g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(150, 70, 20, 16); }
      } });
      // carrés potagers
      const crops = [
        (x, y, h) => { for (let k = 0; k < 4; k++) { px(g, x + k * 7, y - h, 4, 2 + h, '#6ccf5a'); px(g, x + k * 7 + 1, y - h - 1, 2, 1, '#9be37f'); } },
        (x, y, h) => { for (let k = 0; k < 5; k++) { px(g, x + k * 6, y - 1 - h, 1, 2 + h, '#4fa43f'); px(g, x + k * 6 + 2, y - h, 1, 1 + h, '#4fa43f'); px(g, x + k * 6, y + 1, 3, 1, '#ff8c2a'); } },
        (x, y, h) => { for (let k = 0; k < 4; k++) { px(g, x + k * 7, y - 2 - h, 4, 3 + h, '#3f8a36'); px(g, x + k * 7 + 1, y - 1, 2, 2, '#e8402e'); } },
        (x, y, h) => { for (let k = 0; k < 4; k++) { px(g, x + k * 7, y - 1 - h, 5, 2 + h, '#4fa43f'); px(g, x + k * 7 + 2, y, 2, 2, '#ff3d5a'); px(g, x + k * 7 + 2, y, 1, 1, '#ffd6dc'); } }
      ];
      api.CODE_DESKS.forEach((d, i) => list.push({ y: d.y + 12, draw: () => {
        const user = api.codeUser(i);
        px(g, d.x + 14, d.y + 17, 8, 4, '#a77b54'); px(g, d.x + 14, d.y + 17, 8, 1, '#c4966a'); px(g, d.x + 15, d.y + 21, 1, 2, '#6e4628'); px(g, d.x + 20, d.y + 21, 1, 2, '#6e4628');
        px(g, d.x, d.y, 36, 12, '#9a6a3a'); px(g, d.x, d.y, 36, 2, '#b8844e');
        px(g, d.x + 2, d.y + 2, 32, 8, '#5a3a24');
        for (let k = 0; k < 32; k += 3) px(g, d.x + 2 + k, d.y + 4 + (k % 2), 1, 1, '#6e4a30');
        px(g, d.x, d.y + 12, 36, 1, 'rgba(0,0,0,0.25)');
        const grow = user ? (Math.floor(t / 300) % 3) : 0;
        crops[i % 4](d.x + 5, d.y + 6, grow > 1 ? 1 : 0);
        px(g, d.x + 17, d.y - 6, 1, 6, '#8a5a32'); px(g, d.x + 13, d.y - 9, 9, 4, '#e8d3a8'); px(g, d.x + 14, d.y - 8, 7, 2, ['#6ccf5a', '#ff8c2a', '#e8402e', '#ff3d5a'][i % 4]);
        if (user) {
          for (let k = 0; k < 3; k++) {
            const ph = (t / 500 + k / 3) % 1;
            px(g, d.x + 10 + k * 7, d.y - 2 + ph * 8, 1, 2, 'rgba(120,200,255,0.85)');
          }
          g.fillStyle = rgba(user.color, 0.12); g.fillRect(d.x, d.y - 4, 36, 16);
        }
      } }));
      // établi de rempotage
      list.push({ y: 172, draw: () => {
        const running = api.benchRunning();
        px(g, 4, 152, 76, 6, '#9a6a3a'); px(g, 4, 152, 76, 1, '#b8844e');
        px(g, 4, 158, 76, 12, '#7a5236'); px(g, 6, 160, 72, 1, '#6a4630');
        px(g, 6, 168, 4, 4, '#6a4630'); px(g, 74, 168, 4, 4, '#6a4630');
        // pots et semis
        for (let k = 0; k < 4; k++) { px(g, 8 + k * 5, 147, 4, 5, '#c66b3d'); px(g, 9 + k * 5, 144, 2, 3, '#5cbf6a'); }
        // station météo
        px(g, 41, 134, 1, 18, '#cfd6de');
        const a = t / (running ? 60 : 400);
        for (let k = 0; k < 3; k++) px(g, Math.round(41 + Math.cos(a + k * 2.1) * 4), Math.round(134 + Math.sin(a + k * 2.1) * 1.5), 2, 1, '#e8eef4');
        px(g, 33, 143, 7, 6, '#2b2f3a'); px(g, 34, 144, 5, 3, running ? '#5ef1ff' : '#1a3a40');
        // pompe et arroseur
        px(g, 58, 143, 8, 9, '#3a7bd5'); px(g, 60, 140, 4, 3, '#2a5aa0'); px(g, 66, 148, 10, 1, '#2f6b2a'); px(g, 75, 146, 2, 3, '#9aa3b5');
        if (running) for (let k = 0; k < 6; k++) {
          const ph = (t / 400 + k / 6) % 1;
          px(g, 76 + Math.cos(k) * ph * 8, 146 - Math.sin(ph * Math.PI) * 8, 1, 1, 'rgba(140,210,255,0.9)');
        }
        api.drawBenchLamps(t);
        // tonneau de pluie
        px(g, 4, 178, 10, 20, '#7a5236'); px(g, 4, 182, 10, 1, '#4a3020'); px(g, 4, 192, 10, 1, '#4a3020'); px(g, 5, 178, 8, 2, '#5aa7d8');
      } });
      // banc de jardin
      list.push({ y: 141, draw: () => {
        px(g, 236, 128, 64, 3, '#b8844e'); px(g, 236, 133, 64, 3, '#b8844e');
        px(g, 238, 128, 2, 12, '#6e4628'); px(g, 296, 128, 2, 12, '#6e4628');
        px(g, 238, 139, 60, 8, '#a77b54'); for (let x = 238; x < 298; x += 6) px(g, x, 139, 1, 8, '#93633a');
        px(g, 238, 147, 60, 2, '#6e4628');
        px(g, 244, 135, 8, 5, '#a8d8ff'); px(g, 286, 135, 8, 5, '#ffd6e8');
      } });
      list.push({ y: 150, draw: () => {
        px(g, 231, 120, 2, 28, '#6e4628'); px(g, 229, 147, 6, 2, '#5a3a20');
        px(g, 227, 114, 10, 8, '#2b2b2b'); px(g, 228, 115, 8, 6, '#ffd27a'); px(g, 230, 112, 4, 2, '#2b2b2b');
      } });
      list.push({ y: 174, draw: () => {
        px(g, 254, 164, 28, 7, '#f2f2ee'); px(g, 254, 164, 28, 1, '#ffffff');
        px(g, 257, 171, 1, 3, '#c8c8c0'); px(g, 278, 171, 1, 3, '#c8c8c0');
        px(g, 259, 158, 5, 7, 'rgba(230,240,255,0.85)'); px(g, 259, 161, 5, 4, '#ffe066');
        px(g, 270, 162, 8, 3, '#ffffff'); px(g, 271, 161, 2, 1, '#ff3d5a'); px(g, 274, 161, 2, 1, '#ff3d5a');
      } });
      // barbecue
      list.push({ y: 205, draw: () => {
        const busy = api.agentsIn('coffee') > 0;
        px(g, 294, 196, 2, 8, '#2a2a2e'); px(g, 312, 196, 2, 8, '#2a2a2e'); px(g, 303, 196, 2, 9, '#2a2a2e');
        px(g, 292, 184, 24, 12, '#2a2a2e'); px(g, 294, 182, 20, 2, '#3a3a40');
        px(g, 293, 181, 22, 1, '#9aa3b5');
        for (let k = 0; k < 4; k++) px(g, 296 + k * 5, 179, 4, 2, k % 2 ? '#b5653a' : '#c9784a');
        if (busy) {
          px(g, 295, 183, 18, 1, Math.floor(t / 200) % 2 ? '#ff6b2a' : '#ffb347');
          for (let k = 0; k < 4; k++) {
            const ph = (t / 1200 + k / 4) % 1;
            g.fillStyle = `rgba(230,230,230,${0.5 * (1 - ph)})`;
            g.fillRect(Math.round(300 + k * 3 + Math.sin(ph * 6) * 2), Math.round(177 - ph * 22), 2, 2);
          }
        }
        px(g, 290, 162, 14, 10, '#3a7bd5'); px(g, 290, 162, 14, 2, '#f2f2f2');
      } });
      // hérisson
      list.push({ y: 182, draw: () => {
        const x = 212, y = 182, sniff = Math.floor(t / 700) % 2;
        px(g, x, y - 5, 11, 5, '#6b4a30');
        for (let k = 0; k < 6; k++) px(g, x + k * 2, y - 7 + (k % 2), 1, 2, '#4a3020');
        px(g, x + 10, y - 4, 4, 3, '#d9b38c'); px(g, x + 13 + sniff, y - 3, 1, 1, '#1a1a1a'); px(g, x + 11, y - 4, 1, 1, '#1a1a1a');
        px(g, x + 1, y, 2, 1, '#3a2a1a'); px(g, x + 8, y, 2, 1, '#3a2a1a');
        px(g, x, y + 1, 13, 1, 'rgba(0,0,0,0.2)');
      } });
      return list;
    }

    function lighting(t) {
      g.save(); g.globalCompositeOperation = 'lighter';
      glow(300, 6, 70, '#fff3b0', 0.22);
      glow(232, 118, 18, '#ffd27a', 0.12);
      g.restore();
      // ombres de nuages
      for (let i = 0; i < 2; i++) {
        const x = ((i * 190 + t / 150) % 520) - 100, y = 60 + i * 80;
        g.fillStyle = 'rgba(20,40,20,0.10)';
        g.beginPath(); g.ellipse(x, y, 46, 18, 0, 0, Math.PI * 2); g.fill();
      }
      api.vignette(0.18);
    }

    return {
      id: 'garden', name: 'Jardin', icon: '🌻', claudeTitle: 'Jardinier en chef',
      glyphs: ['✿', '❀', '☘', '✽', '❁'],
      status: { coding: 'Jardine', reading: 'Observe la serre', planning: 'Trace le potager', bash: "Teste l'arrosage", coffee: 'Au barbecue', idle: 'Au barbecue' },
      background, top, board, props, lighting
    };
  }

  /* ================================================================
   * SALLE DE CLASSE
   * ================================================================ */
  function classroom(api) {
    const { px, shade, rgba, hash, roundRect, glow, g } = api;

    function background(c, rand) {
      // lino en damier
      for (let y = 36; y < 208; y += 8) for (let x = 0; x < 320; x += 8) px(c, x, y, 8, 8, (x / 8 + (y - 36) / 8) % 2 ? '#d3c9b2' : '#c4b99f');
      for (let y = 36; y < 208; y += 8) px(c, 0, y, 320, 1, 'rgba(0,0,0,0.05)');
      // murs
      px(c, 0, 0, 320, 36, '#eadfc2');
      px(c, 0, 22, 320, 12, '#8fb3a3'); px(c, 0, 22, 320, 1, '#a8c8b8'); px(c, 0, 33, 320, 3, '#5f7f70');
      px(c, 0, 36, 320, 2, 'rgba(0,0,0,0.15)');
      // frise alphabet
      for (let i = 0, x = 2; x < 320; x += 9, i++) {
        if (x > 8 && x < 88) continue;
        if (x > 120 && x < 198) continue;
        if (x > 218) continue;
        const col = ['#e8504a', '#3d8fd6', '#f2c94c', '#57b56a', '#a66bd6'][i % 5];
        px(c, x, 0, 7, 3, col); px(c, x + 2, 1, 3, 1, '#ffffff');
      }
      // tableau noir
      px(c, 10, 4, 76, 26, '#8a5a32'); px(c, 12, 6, 72, 22, '#2f4f3a');
      for (let i = 0; i < 30; i++) px(c, 13 + Math.floor(rand() * 70), 7 + Math.floor(rand() * 20), 2 + Math.floor(rand() * 4), 1, '#3a5d47');
      px(c, 12, 28, 72, 2, '#7a5236');
      px(c, 20, 27, 4, 1, '#ffffff'); px(c, 27, 27, 3, 1, '#ffb3c8'); px(c, 33, 27, 3, 1, '#ffe680'); px(c, 70, 27, 7, 1, '#d8c7a0');
      // carte du monde
      px(c, 91, 6, 18, 14, '#f2efe6'); px(c, 92, 7, 16, 12, '#7fc0e8');
      px(c, 94, 9, 4, 3, '#57b56a'); px(c, 99, 8, 3, 6, '#57b56a'); px(c, 103, 10, 4, 4, '#57b56a'); px(c, 95, 14, 2, 3, '#57b56a');
      // fenêtre
      px(c, 124, 4, 72, 26, '#f4f1e8');
      px(c, 126, 6, 68, 22, '#a8dcfa'); px(c, 126, 6, 68, 8, '#92d0f6');
      px(c, 159, 6, 2, 22, '#f4f1e8'); px(c, 126, 16, 68, 1, '#f4f1e8');
      px(c, 124, 29, 72, 2, '#d8d2c2');
      // bibliothèque claire
      px(c, 220, 4, 52, 40, '#c08a55'); px(c, 222, 6, 48, 36, '#8a5a32');
      for (let s = 0; s < 4; s++) {
        const sy = 6 + s * 9;
        px(c, 222, sy + 8, 48, 1, '#c08a55');
        let x = 223;
        while (x < 268) {
          const bw = 2 + Math.floor(rand() * 3), bh = 5 + Math.floor(rand() * 3);
          if (x + bw > 269) break;
          const col = ['#e8504a', '#3d8fd6', '#f2c94c', '#57b56a', '#a66bd6', '#ff8c42', '#2bb3a3'][Math.floor(rand() * 7)];
          px(c, x, sy + 8 - bh, bw, bh, col); px(c, x, sy + 8 - bh, bw, 1, shade(col, 0.3));
          x += bw + (rand() < 0.15 ? 1 : 0);
        }
      }
      // aquarium sur meuble
      px(c, 276, 30, 38, 15, '#c08a55'); px(c, 276, 30, 38, 1, '#d8a46e'); px(c, 284, 34, 8, 1, '#8a5a32'); px(c, 298, 34, 8, 1, '#8a5a32');
      px(c, 277, 9, 36, 21, '#d8eef6'); px(c, 278, 10, 34, 19, '#7fc8e0');
      px(c, 278, 10, 34, 2, '#a8dcec'); px(c, 278, 26, 34, 3, '#e6d29a');
      px(c, 282, 18, 2, 8, '#3fa66b'); px(c, 284, 21, 2, 5, '#2e8a56'); px(c, 306, 17, 2, 9, '#3fa66b');
      // tapis
      roundRect(c, 102, 76, 116, 46, '#3d6b8a'); roundRect(c, 105, 79, 110, 40, '#4a7ea0');
      for (let y = 142; y < 192; y += 6) for (let x = 232; x < 308; x += 6) px(c, x, y, 6, 6, ['#e8504a', '#3d8fd6', '#f2c94c', '#57b56a'][((x - 232) / 6 + (y - 142) / 6) % 4]);
    }

    function top(t) {
      // arbres derrière la fenêtre
      const sw = Math.round(Math.sin(t / 1500));
      px(g, 130 + sw, 18, 14, 10, '#57b56a'); px(g, 133 + sw, 15, 8, 4, '#6cc77d'); px(g, 136, 26, 2, 2, '#7a5236');
      px(g, 172 - sw, 16, 16, 12, '#4fa65f'); px(g, 176 - sw, 13, 8, 4, '#6cc77d');
      const cx = ((t / 250) % 90) + 120;
      if (cx < 192) { px(g, cx, 8, 8, 2, '#ffffff'); px(g, cx + 2, 7, 4, 1, '#ffffff'); }
      api.drawClock(207, 14, '#5f7f70', '#ffffff');
      // poissons et bulles
      for (let i = 0; i < 3; i++) {
        const ph = (t / (2200 + i * 600) + i * 0.3) % 2;
        const dir = ph < 1 ? 1 : -1;
        const fx = 280 + Math.round((ph < 1 ? ph : 2 - ph) * 26), fy = 13 + i * 4;
        const col = ['#ff8c2a', '#ffd23f', '#ff5c8a'][i];
        px(g, fx, fy, 4, 2, col); px(g, dir > 0 ? fx - 1 : fx + 4, fy, 1, 2, shade(col, -0.2)); px(g, dir > 0 ? fx + 3 : fx, fy, 1, 1, '#1a1a1a');
      }
      const nb = api.anyReading() ? 5 : 2;
      for (let k = 0; k < nb; k++) {
        const ph = (t / 1500 + k / nb) % 1;
        px(g, 300 + (k % 2) * 4, Math.round(25 - ph * 14), 1, 1, '#e6f8ff');
      }
      for (const a of api.readers()) {
        if (a.slot > 1) continue;
        const bx = Math.round(a.x) - 2 + ((Math.floor(t / 900) % 3) - 1) * 3;
        const sy = 6 + (Math.floor(t / 1800 + a.slot) % 4) * 9;
        px(g, bx, sy + 4, 3, 5, '#fffdf4'); px(g, bx, sy + 4, 3, 1, a.color);
      }
    }

    function board(t, strokes) {
      px(g, 16, 8, 26, 1, '#cfd8cf'); px(g, 16, 10, 16, 1, '#cfd8cf');
      api.drawStrokes(strokes, t, { color: s => shade(s.color, 0.55), line: '#e8efe8' });
    }

    function props(t) {
      const list = [];
      // cactus
      list.push({ y: 48, draw: () => {
        px(g, 110, 41, 10, 7, '#e08850'); px(g, 110, 41, 10, 1, '#f0a070');
        px(g, 113, 28, 4, 13, '#4fa65f'); px(g, 109, 32, 3, 2, '#4fa65f'); px(g, 109, 29, 2, 4, '#4fa65f'); px(g, 118, 34, 3, 2, '#4fa65f'); px(g, 119, 31, 2, 4, '#4fa65f');
        px(g, 114, 30, 1, 9, '#6cc77d'); px(g, 114, 26, 2, 2, '#ff6b9e');
      } });
      // bureau du professeur
      list.push({ y: 108, draw: () => {
        px(g, 126, 86, 68, 8, '#c08a55'); px(g, 126, 86, 68, 1, '#d8a46e');
        px(g, 126, 94, 68, 12, '#9a6a3a');
        px(g, 128, 96, 26, 8, '#8a5a32'); px(g, 166, 96, 26, 8, '#8a5a32');
        px(g, 139, 99, 4, 1, '#e6c08a'); px(g, 177, 99, 4, 1, '#e6c08a');
        px(g, 126, 106, 68, 2, 'rgba(0,0,0,0.25)');
        // globe
        px(g, 141, 86, 6, 1, '#5a5a5a'); px(g, 143, 84, 2, 2, '#5a5a5a');
        px(g, 140, 77, 8, 7, '#3d8fd6'); px(g, 141, 76, 6, 9, '#3d8fd6'); px(g, 141, 78, 3, 2, '#57b56a'); px(g, 145, 80, 2, 3, '#57b56a');
        // pot à crayons
        px(g, 130, 81, 5, 6, '#e8504a'); px(g, 130, 78, 1, 3, '#f2c94c'); px(g, 132, 77, 1, 4, '#3d8fd6'); px(g, 134, 79, 1, 2, '#57b56a');
        // copie en cours de correction
        px(g, 152, 87, 14, 4, '#fafafa'); for (let k = 0; k < 2; k++) px(g, 153, 88 + k * 2, 12, 1, '#c8d4e8');
        if (api.mainActive()) { const k = Math.floor(t / 120) % 10; px(g, 154 + k, 87 + (k % 2), 1, 2, '#e8402e'); }
        // pile de copies reçues
        for (let i = 0; i < api.deskPile(); i++) { px(g, 172, 86 - i, 9, 2, i % 2 ? '#fafafa' : '#ececec'); px(g, 172, 86 - i, 9, 1, '#ffffff'); }
        // pomme
        px(g, 185, 82, 5, 5, '#e8402e'); px(g, 186, 81, 3, 1, '#e8402e'); px(g, 186, 83, 1, 1, '#ff8a7a');
        px(g, 187, 79, 1, 2, '#6b3e26'); px(g, 188, 79, 2, 1, '#57b56a');
        px(g, 151, 99, 18, 5, '#2f4f3a'); px(g, 152, 100, 16, 3, '#f2efe6');
      } });
      // pupitres d'élèves
      api.CODE_DESKS.forEach((d, i) => list.push({ y: d.y + 12, draw: () => {
        const user = api.codeUser(i);
        px(g, d.x + 13, d.y + 16, 10, 6, '#3d6fb6'); px(g, d.x + 13, d.y + 16, 10, 1, '#5a8ad0');
        px(g, d.x + 14, d.y + 22, 1, 2, '#6b6f78'); px(g, d.x + 21, d.y + 22, 1, 2, '#6b6f78');
        px(g, d.x, d.y, 36, 6, '#c08a55'); px(g, d.x, d.y, 36, 1, '#d8a46e');
        px(g, d.x, d.y + 6, 36, 3, '#9a6a3a');
        px(g, d.x + 2, d.y + 9, 2, 3, '#6b6f78'); px(g, d.x + 32, d.y + 9, 2, 3, '#6b6f78');
        px(g, d.x, d.y + 12, 36, 1, 'rgba(0,0,0,0.2)');
        // cahier ouvert
        px(g, d.x + 11, d.y + 1, 14, 4, '#fafafa'); px(g, d.x + 18, d.y + 1, 1, 4, '#d8d8d8');
        const lines = user ? 1 + (Math.floor(t / 400) % 4) : 2;
        for (let k = 0; k < Math.min(lines, 3); k++) px(g, d.x + 12, d.y + 2 + k, 5, 1, '#8aa0c8');
        if (user) {
          const k = Math.floor(t / 110) % 6;
          px(g, d.x + 19 + k, d.y - 1, 1, 3, '#ffcf33'); px(g, d.x + 19 + k, d.y + 2, 1, 1, '#3a2a1a');
          g.fillStyle = rgba(user.color, 0.12); g.fillRect(d.x + 6, d.y - 4, 24, 12);
        }
        px(g, d.x + 28, d.y + 2, 6, 2, ['#e8504a', '#3d8fd6', '#a66bd6', '#57b56a'][i % 4]);
        // trousse et petit chevalet porte-nom
        px(g, d.x + 15, d.y - 5, 6, 4, '#fafafa'); px(g, d.x + 16, d.y - 4, 4, 1, ['#e8504a', '#3d8fd6', '#a66bd6', '#57b56a'][i % 4]);
      } }));
      // paillasse de sciences
      list.push({ y: 172, draw: () => {
        const running = api.benchRunning();
        px(g, 4, 152, 76, 6, '#e9ecef'); px(g, 4, 152, 76, 1, '#ffffff');
        px(g, 4, 158, 76, 12, '#5a6b7a'); for (let x = 8; x < 78; x += 18) px(g, x, 160, 14, 8, '#4e5e6c');
        px(g, 4, 170, 76, 2, 'rgba(0,0,0,0.25)');
        // microscope
        px(g, 10, 150, 12, 2, '#3a3f4c'); px(g, 18, 140, 3, 10, '#3a3f4c'); px(g, 13, 140, 6, 3, '#3a3f4c'); px(g, 14, 143, 2, 4, '#c8ccd6'); px(g, 12, 146, 8, 1, '#c8ccd6');
        // éprouvettes et ballon
        for (let k = 0; k < 4; k++) { px(g, 32 + k * 3, 142, 2, 9, '#dde8f0'); px(g, 32 + k * 3, 146 + (k % 2), 2, 5 - (k % 2), ['#ff6ac1', '#5ef1ff', '#7ee787', '#ffd166'][k]); }
        px(g, 32, 151, 12, 1, '#8a9aaa');
        px(g, 46, 144, 5, 8, '#dde8f0'); px(g, 47, 140, 3, 4, '#dde8f0'); px(g, 46, 147, 5, 5, '#a66bd6');
        if (running) for (let k = 0; k < 3; k++) { const ph = (t / 500 + k / 3) % 1; px(g, 47 + k, Math.round(146 - ph * 10), 1, 1, '#e3c8ff'); }
        // bec Bunsen + erlenmeyer
        px(g, 60, 146, 4, 6, '#9aa3b5'); px(g, 58, 151, 8, 1, '#6b6f78');
        if (running) { const fl = Math.floor(t / 80) % 2; px(g, 61, 142 - fl, 2, 4 + fl, '#5aa7ff'); px(g, 61, 144, 2, 2, '#c8e4ff'); }
        px(g, 68, 144, 8, 8, '#dde8f0'); px(g, 70, 140, 4, 4, '#dde8f0'); px(g, 68, 148, 8, 4, '#7ee787');
        api.drawBenchLamps(t);
        // armoire à bocaux
        px(g, 4, 176, 10, 22, '#c08a55'); px(g, 5, 177, 8, 20, '#9a6a3a');
        for (let k = 0; k < 3; k++) { px(g, 6, 179 + k * 6, 6, 4, '#dde8f0'); px(g, 6, 181 + k * 6, 6, 2, ['#ffd166', '#7ee787', '#ff6ac1'][k]); }
      } });
      // poufs du coin lecture
      list.push({ y: 141, draw: () => {
        const bag = (x, col) => { px(g, x + 2, 128, 16, 4, col); px(g, x, 131, 20, 14, col); px(g, x + 2, 145, 16, 3, shade(col, -0.25)); px(g, x + 4, 130, 6, 2, shade(col, 0.3)); };
        bag(236, '#e8504a'); bag(258, '#f2c94c'); bag(280, '#3d8fd6');
      } });
      // porte-manteau
      list.push({ y: 150, draw: () => {
        px(g, 231, 118, 2, 30, '#8a5a32'); px(g, 228, 147, 8, 2, '#6e4628');
        px(g, 227, 119, 10, 1, '#8a5a32');
        px(g, 225, 120, 6, 9, '#a66bd6'); px(g, 226, 122, 4, 3, '#c79af0');
        px(g, 234, 121, 5, 7, '#ffd166');
      } });
      list.push({ y: 174, draw: () => {
        px(g, 252, 164, 32, 8, '#c08a55'); px(g, 252, 164, 32, 1, '#d8a46e');
        px(g, 256, 165, 7, 4, '#3d8fd6'); px(g, 256, 165, 7, 1, '#7ab6ee');
        px(g, 266, 166, 1, 3, '#e8504a'); px(g, 268, 166, 1, 3, '#57b56a'); px(g, 270, 166, 1, 3, '#f2c94c'); px(g, 274, 165, 6, 4, '#fafafa');
      } });
      // casiers
      list.push({ y: 205, draw: () => {
        px(g, 288, 160, 30, 46, '#c08a55');
        const bags = ['#e8504a', '#3d8fd6', null, '#57b56a', '#a66bd6', '#ffd166', null, '#ff8c42'];
        for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) {
          const x = 290 + k * 14, y = 162 + r * 11;
          px(g, x, y, 12, 9, '#8a5a32');
          const col = bags[r * 2 + k];
          if (col) { px(g, x + 3, y + 2, 6, 7, col); px(g, x + 4, y + 1, 4, 1, shade(col, -0.25)); }
        }
      } });
      // cage du hamster
      list.push({ y: 182, draw: () => {
        const x = 208, y = 182;
        px(g, x, y - 2, 20, 3, '#3d8fd6');
        for (let k = 0; k <= 20; k += 3) px(g, x + k, y - 14, 1, 12, '#c8ccd6');
        px(g, x, y - 15, 21, 1, '#c8ccd6'); px(g, x + 3, y - 18, 15, 3, '#c8ccd6');
        const a = t / 200;
        px(g, x + 9, y - 10, 9, 8, 'rgba(0,0,0,0)');
        for (let k = 0; k < 8; k++) px(g, Math.round(x + 13 + Math.cos(a + k * 0.785) * 4), Math.round(y - 7 + Math.sin(a + k * 0.785) * 4), 1, 1, '#ff8c42');
        px(g, x + 12, y - 5, 3, 2, '#f2c094'); px(g, x + 14, y - 5, 1, 1, '#1a1a1a');
        px(g, x + 3, y - 4, 4, 2, '#e6d29a');
      } });
      return list;
    }

    function lighting(t) {
      g.save(); g.globalCompositeOperation = 'lighter';
      glow(160, 20, 80, '#fff7d6', 0.16);
      glow(295, 20, 22, '#7fdcff', 0.08);
      if (api.benchRunning()) glow(60, 146, 18, '#5aa7ff', 0.1);
      g.restore();
      g.fillStyle = 'rgba(255,230,180,0.04)'; g.fillRect(0, 0, 320, 208);
      api.vignette(0.16);
    }

    return {
      id: 'classroom', name: 'Salle de classe', icon: '🏫', claudeTitle: 'Professeur',
      glyphs: ['A+', 'abc', '✎', '1+1', '√2', '10/10', 'π'],
      status: { coding: 'Fait ses exercices', reading: 'Lit à la bibliothèque', planning: 'Passe au tableau', bash: 'Fait une expérience', coffee: 'En récré', idle: 'En récré' },
      background, top, board, props, lighting
    };
  }

  root.ROOM_WORLDS = { opera, garden, classroom };
})(window);
