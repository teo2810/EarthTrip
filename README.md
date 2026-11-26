# EarthTrip

Globo interattivo di Terra e Luna.

- Giorno nitido e notte con le sole luci delle città
- Confini, capitali, atmosfera e nubi
- Satelliti LEO, MEO e GEO/HEO da TLE Celestrak, con riserva offline
- Mari, crateri e siti Apollo
- Zoom e rotazione che rallentano vicino alla superficie

Interfaccia in italiano. I dati restano nel browser.
La copia statica per GitHub Pages è in `docs/`: `index.html`, `style.css`, il bundle versionato `app-v<N>.js`
(oggi `app-v23.js`), `sw.js` (cache `earthtrip-v<N>` più `earth-assets-v1` per texture e dati dei CDN), `manifest.json` e le icone.

## Sviluppo e build

- `npm run dev`: app di sviluppo (TanStack Start) su `http://localhost:8080`.
- `npm run build:docs -- 23`: rigenera `docs/` con `vite.client.config.ts` (bundle IIFE + `style.css` estratto),
  rinomina il bundle in `app-v23.js`, cancella i bundle precedenti, copia le icone della PWA da `public/` e aggiorna
  `index.html` e `sw.js`. Script: `scripts/build-docs.mjs`.
- `npm run lint`, `npm run typecheck`.
- Le versioni sono descritte in `CHANGELOG.md`.

## Difendi la Terra

- Al primo avvio un tutorial di 3 passi (globo, dock, Difendi la Terra); «Non mostrare più» lo salva nel browser.
- Cannone personale con quattro modalità (Singolo, Doppio, Mitra, Rosa; nessuna perfora: ogni colpo si ferma sul primo nemico), ognuna da sbloccare e da portare dal Liv. 1 al Liv. 12.
- Fino a 10 torrette: Cannone base, Lancia-missili e Mortaio. Ogni torretta in più costa il 25% in più; Cadenza e Calibro valgono per tutte.
- Testate dei missili: Singolo, Rada, Grappolo, Ricerca, Termobarica. Più potenza, ricarica più lunga.
- Ogni livello costa base × 1,22^livello. Tutti i numeri del bilanciamento sono in `src/earth/defense-balance.ts`.
- Pulsante Pausa nell'HUD; la partita va in pausa da sola se la scheda passa in background.
- Bonus dai nemici: scudo, riparazione e Gelo. Col Gelo i nemici si fermano, mentre torrette, missili e scudo restano attivi.
- La partita si salva a fine ondata e si riprende dalla mini guida. Record e storico si salvano anche quando la Terra esplode.
- Il boss si annuncia, entra nello schermo e non si può colpire prima; orbita sempre fuori dall'orbita della Luna.
- Shop a schede (Cannone, Torrette, Missili), navigabile anche da tastiera.
- Nave tesoro (40% delle ondate dalla 2): attraversa lo schermo e spara alla Terra. Se la abbatti lascia una moneta che vale la prossima torretta Cannone base; va toccata entro 9 secondi.
- Prima del teletrasporto il boss manda in tilt il segnale e una freccia verde indica dove ricomparirà.
