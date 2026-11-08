/*
 * Mondes de la chambre (vue isométrique).
 *
 * Tous les mondes partagent la même disposition (postes, obstacles, chemins) :
 * seul l'habillage change, ce qui permet de basculer de monde en direct.
 * Un monde = des textes, une palette (`pal`) et un décor peint une seule fois
 * (`decor`), par-dessus la pièce de base. `en` traduit le nom, le titre de Claude
 * et les statuts quand la page est en anglais.
 *
 * Repères (plan logique 320×208, mur du fond en y = 40, mur de gauche en x = 0) :
 *   tableau        mur du fond, x 16–92, hauteur 12–40
 *   fenêtre        mur du fond, x 118–192, hauteur 16–42
 *   bibliothèque   x 220–300 contre le mur du fond
 *   bureau Claude  x 130–190, y 96–106 (Claude debout en (160, 92))
 *   banc de test   x 2–82, y 148–168      salon : canapé x 230–306, y 128–150
 *
 * `decor(api)` reçoit :
 *   planeS(x, y, w, z, h, couleur)   rectangle sur un plan face au sud (mur du fond : y = 40)
 *   planeE(x, y, dep, z, h, couleur) rectangle sur un plan face à l'est (mur de gauche : x = 0)
 *   box(x, y, w, dep, h, cols3(dessus, sud, est), z)   boîte pleine
 *   floor(x, y, w, dep, couleur)     peinture au sol
 *   px(x, y, w, h, couleur)          pixels à l'écran ; P(x, y, z) projette un point du plan
 *   rand()                           aléatoire reproductible ; shade(couleur, ±0..1)
 */
(function (root) {
  'use strict';

  const studio = {
    id: 'studio', name: 'Studio dev', icon: '💻', claudeTitle: 'Orchestrateur',
    en: { name: 'Dev studio', claudeTitle: 'Orchestrator' },
    glyphs: ['{ }', '=>', '</>', ';', '( )', 'fn', '++', '[ ]', '&&', '#', '==='],
    status: {},
    pal: {
      bg: '#0c0a12', floorA: '#6b4a36', floorB: '#74523c', grout: '#5a3d2c', grain: 0.06,
      wallBack: '#3a2f57', wallLeft: '#2e2547', trim: '#4a3d6e', base: '#241c38',
      rug: '#3b2d5e', wood: '#8a5a3c', woodSide: '#6e4630', woodDark: '#5a3826',
      metal: '#2a2f3a', metalDark: '#1b1f27', screen: '#123040', screenOn: '#5ef1ff',
      bench: '#4a4f5c', benchSide: '#3a3e49', sofa: '#6b3a6e',
      board: '#e9e4f5', boardFrame: '#9a93b0', shelf: '#5a3d2a',
      items: ['#e06c75', '#61afef', '#98c379', '#e5c07b', '#c678dd', '#56b6c2'],
      sky: '#1b2b4a', lights: true, night: 'rgba(14,8,30,0.22)', lamp: '#ffb86b', vignette: 0.4
    },
    decor({ planeE, planeS, rand }) {
      // affiches et porte sur le mur de gauche
      planeE(0, 60, 22, 14, 22, '#1d1830'); planeE(0, 62, 18, 16, 18, '#ff6ac1'); planeE(0, 66, 10, 22, 6, '#5ef1ff');
      planeE(0, 96, 18, 18, 16, '#1d1830'); planeE(0, 98, 14, 20, 12, '#7ee787');
      planeE(0, 132, 26, 0, 34, '#2a2040'); planeE(0, 134, 22, 0, 32, '#3d2f5a'); planeE(0, 152, 2, 14, 2, '#c9a24a');
      // post-it autour du tableau
      for (let i = 0; i < 4; i++) planeS(94 + (i % 2) * 6, 40, 4, 18 + Math.floor(i / 2) * 7 + Math.floor(rand() * 2), 4, ['#f1fa8c', '#ff6ac1', '#5ef1ff', '#7ee787'][i]);
    }
  };

  const opera = {
    id: 'opera', name: 'Opéra', icon: '🎭', claudeTitle: "Chef d'orchestre",
    en: { name: 'Opera', claudeTitle: 'Conductor', status: { coding: 'Playing their part', reading: 'Reading the score', planning: 'Writing the score', bash: 'Tuning the sound desk', coffee: 'In the dressing room' } },
    glyphs: ['♪', '♫', '♩', '♬', '𝄞', '♭', '♯'],
    status: { coding: 'Joue sa partie', reading: 'Lit la partition', planning: 'Écrit la partition', bash: 'Règle la sono', coffee: 'En loge' },
    pal: {
      bg: '#0d0408', floorA: '#5a1e2a', floorB: '#62232f', grout: '#4a1824', grain: 0.1,
      wallBack: '#3b1a24', wallLeft: '#2f141c', trim: '#c9a24a', base: '#1b0b13',
      rug: '#8e1b2e', wood: '#6b3a1f', woodSide: '#552c17', woodDark: '#43220f',
      metal: '#3a2a20', metalDark: '#241810', screen: '#2a1a10', screenOn: '#ffd28a',
      bench: '#4a2f1f', benchSide: '#3a2416', sofa: '#8e1b2e', seat: '#b33048',
      board: '#f3e8cc', boardFrame: '#c9a24a', boardInk: '#3a2416', shelf: '#3b2416',
      items: ['#c9a24a', '#ecd28a', '#b08a3a', '#d8b860'], windowFrame: '#c9a24a',
      sky: '#141a3d', lights: false, night: 'rgba(20,6,12,0.26)', lamp: '#ffd28a', lampShade: '#ffe9b8', cat: '#2a2030', vignette: 0.5
    },
    decor({ planeS, planeE }) {
      // rideaux de velours de part et d'autre de la fenêtre-scène
      for (const x0 of [104, 194]) for (let i = 0; i < 12; i += 2) planeS(x0 + i, 40, 2, 10, 34, i % 4 ? '#8e1b2e' : '#6a1121');
      planeS(100, 40, 110, 42, 4, '#a11f35');
      // portraits dorés sur le mur de gauche
      for (const d of [70, 112]) { planeE(0, d, 24, 16, 22, '#c9a24a'); planeE(0, d + 2, 20, 18, 18, '#3a2416'); planeE(0, d + 8, 8, 24, 8, '#e0b080'); }
      // tuyaux d'orgue au-dessus de la bibliothèque
      for (let i = 0; i < 10; i++) planeS(224 + i * 8, 48, 4, 36, 4 + (i % 3) * 3, '#ecd28a');
    }
  };

  const garden = {
    id: 'garden', name: 'Jardin', icon: '🌻', claudeTitle: 'Jardinier en chef',
    en: { name: 'Garden', claudeTitle: 'Head gardener', status: { coding: 'Planting', reading: 'Checking the greenhouse', planning: 'Drawing the vegetable patch', bash: 'Watering', coffee: 'At the barbecue' } },
    glyphs: ['❀', '✿', '☘', '❁', '♣', '✾'],
    status: { coding: 'Plante', reading: 'Observe la serre', planning: 'Dessine le potager', bash: 'Arrose', coffee: 'Au barbecue' },
    pal: {
      bg: '#9fd8f5', floorA: '#4f7a3a', floorB: '#578443', grout: '#456b33', grain: 0.18,
      wallBack: '#2f5a2a', wallLeft: '#264d22', trim: '#7aa35a', base: '#1f3d1b',
      rug: '#8b6b43', wood: '#9b7a4b', woodSide: '#7d5f37', woodDark: '#644a2a',
      metal: '#5a6b5a', metalDark: '#3f4d3f', screen: '#2f4a2a', screenOn: '#b8f28a',
      bench: '#7d5f37', benchSide: '#644a2a', sofa: '#c96d3b', seat: '#e08a50',
      board: '#d8c9a0', boardFrame: '#7d5f37', boardInk: '#3f6b2a', shelf: '#7fb8a8', shelfSide: '#5f9888',
      items: ['#ff6b8b', '#ffd166', '#c77dff', '#f8f9fa', '#ff9f43', '#7ee787'], windowFrame: '#7d5f37', leaf: '#4f9a3a',
      sky: '#8fd3ff', day: true, lights: true, night: null, lamp: '#fff1c1', lampShade: '#fff6d0', cat: '#8a7a6a', vignette: 0.2
    },
    decor({ planeS, planeE, floor, rand }) {
      // haie : feuillage sur les deux murs
      for (let i = 0; i < 260; i++) {
        const z = 3 + Math.floor(rand() * 40), col = rand() < 0.5 ? '#3f7a35' : '#234a20';
        if (rand() < 0.6) planeS(Math.floor(rand() * 160) * 2, 40, 2, z, 2, col); else planeE(0, 40 + Math.floor(rand() * 84) * 2, 2, z, 2, col);
      }
      // fleurs au pied de la haie, allée de pierres
      for (let i = 0; i < 30; i++) planeS(6 + i * 10, 40, 2, 2, 2, ['#ff6b8b', '#ffd166', '#c77dff', '#f8f9fa'][i % 4]);
      for (let i = 0; i < 7; i++) floor(146 + (i % 2) * 6, 112 + i * 14, 10, 6, '#b8b0a0');
      // ruche près de la serre
      planeS(206, 44, 10, 0, 12, '#e5b54a'); planeS(206, 44, 10, 4, 1, '#a07a2a'); planeS(206, 44, 10, 8, 1, '#a07a2a');
    }
  };

  const classroom = {
    id: 'classroom', name: 'Salle de classe', icon: '🏫', claudeTitle: 'Professeur',
    en: { name: 'Classroom', claudeTitle: 'Teacher', status: { coding: 'Doing exercises', reading: 'Reading in the library', planning: 'Writing on the board', bash: 'Running an experiment', coffee: 'At recess' } },
    glyphs: ['A', 'B', 'C', '1', '2', '3', '+', '=', '?'],
    status: { coding: 'Fait ses exercices', reading: 'Lit à la bibliothèque', planning: 'Écrit au tableau', bash: 'Fait une expérience', coffee: 'En récré' },
    pal: {
      bg: '#1a1410', floorA: '#b08a5a', floorB: '#a7814f', grout: '#94703f', grain: 0.12,
      wallBack: '#d9cfae', wallLeft: '#c9bf9e', trim: '#7a5a3a', base: '#6b4f33',
      rug: '#3f6e8c', wood: '#c49a6c', woodSide: '#a37c50', woodDark: '#86633e',
      metal: '#5a6070', metalDark: '#40454f', screen: '#1f3a2a', screenOn: '#9ef0c0',
      bench: '#e8e2d0', benchSide: '#c8c0a8', sofa: '#3f6e8c', seat: '#5a8aaa',
      board: '#2f5a3e', boardFrame: '#7a5a3a', boardInk: '#f4f4f4', shelf: '#8a6440',
      items: ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#ecf0f1'], windowFrame: '#f4f0e0',
      sky: '#8fd3ff', day: true, lights: false, night: 'rgba(0,0,0,0.03)', lamp: '#fff6d8', lampShade: '#f4f0e0', cat: '#5a5a5a', vignette: 0.22
    },
    decor({ planeS, planeE }) {
      // frise de l'alphabet en haut du mur du fond
      const hues = ['#e74c3c', '#f39c12', '#27ae60', '#2980b9', '#8e44ad'];
      for (let i = 0; i < 26; i++) planeS(8 + i * 12, 40, 8, 36, 6, hues[i % hues.length]);
      // carte du monde et étagère à plantes sur le mur de gauche
      planeE(0, 64, 46, 12, 24, '#7a5a3a'); planeE(0, 66, 42, 14, 20, '#7fc4e8');
      planeE(0, 72, 12, 18, 10, '#6cbf5a'); planeE(0, 90, 10, 20, 8, '#6cbf5a'); planeE(0, 98, 6, 26, 6, '#e8d070');
      planeE(0, 130, 28, 0, 34, '#86633e'); planeE(0, 132, 24, 0, 32, '#a37c50'); planeE(0, 134, 4, 6, 4, '#3a2a1a');
    }
  };

  root.ROOM_WORLDS = { studio, opera, garden, classroom };
})(typeof window !== 'undefined' ? window : globalThis);
