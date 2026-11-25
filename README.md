# EarthTrip

Globo interattivo di Terra e Luna.

- Giorno nitido e notte con le sole luci delle città
- Confini, capitali, atmosfera e nubi
- Satelliti LEO, MEO e GEO/HEO da TLE Celestrak, con riserva offline
- Mari, crateri e siti Apollo
- Zoom e rotazione che rallentano vicino alla superficie

Interfaccia in italiano. I dati restano nel browser.
La copia statica per GitHub Pages è in `docs/` (`index.html`, `style.css`, `app.js`), allineata al sorgente.

## Difendi la Terra

- Cannone personale con quattro modalità (Singolo, Doppio, Mitra, Rosa), ognuna da sbloccare e da portare dal Liv. 1 al Liv. 10.
- Fino a 8 torrette: Cannone base, Lancia-missili e Mortaio. Ogni torretta in più costa il 25% in più; Cadenza e Calibro valgono per tutte.
- Testate dei missili: Singolo, Rada, Grappolo, Ricerca, Termobarica. Più potenza, ricarica più lunga.
- Ogni livello costa base × 1,35^livello. Tutti i numeri del bilanciamento sono in `src/earth/defense-balance.ts`.
- La partita si salva a fine ondata e si riprende dalla mini guida. Record e storico delle versioni precedenti restano.
- Il boss si annuncia, entra nello schermo e non si può colpire prima. Le torrette mirano solo a ciò che è visibile.
