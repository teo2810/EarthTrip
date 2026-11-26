# Changelog

## v24 · 2026-11-26

- Nuovo sistema dei boss al posto del vecchio, alternati per ondata: **Satellite Madre** (dispari) e **Asteroide Anomalo** (pari).
- Satellite Madre: orbita ellittica fissa, adattata allo schermo e fuori dall'orbita lunare. Ha 3 scudi direzionali che ruotano (uno frontale, due laterali): i colpi che li prendono rimbalzano. Durante la carica dell'attacco pesante il frontale si apre e lascia scoperto il nucleo; a fine carica parte una raffica.
- Asteroide Anomalo: nella fase 1 è una corazza che si frantuma dopo N colpi. Nella fase 2 esce un nucleo instabile che salta tra quote vicine e lontane con un rimbalzo, e lo zoom lo regola il giocatore con lo slider.
- Attacchi comuni: un laser che spazza lentamente un arco e danneggia la Terra se il cannone resta nel raggio, e una pioggia di asteroidi piccoli dai bordi, fatta con i detriti normali.
- Punto debole dinamico: si scopre ogni pochi secondi ed è annunciato da un suono di carica sintetizzato con WebAudio. Lì il colpo fa critico ×3 (scritta «CRITICO ×3» e lampo); altrove fa danno ridotto (scintilla) o rimbalza. Con la riduzione del movimento la scritta resta ferma e non ci sono lampi né scosse.
- Restano le regole di prima: niente perforazione, il boss in ingresso blocca i colpi senza danno, la rotazione della Terra viene ripristinata all'uscita. Tutti i numeri stanno in `BALANCE.boss` e sono provvisori.

## v23 · 2026-11-26

- Capitali fuori posto (Roma in mare): conversione lat/lon, texture, confini e Leaflet erano già allineati; era l'etichetta. Tutta l'etichetta era centrata sopra il punto (`translate(-50%, -120%)`) e il pallino, a sinistra del nome, finiva mezza etichetta più a ovest e una riga più su (25–50 px, 0,6–1,3°). Ora il pallino è un elemento ancorato al punto esatto e il nome sta alla sua destra.
- Città del Vaticano non compare più: coincideva con Roma e ne nascondeva l'etichetta.

## v22 · 2026-11-26

Correzioni sulla v21 (`1518c38`).

- Colpi che attraversavano i nemici: il Singolo, l'arma di partenza, aveva `pierce: 2` e ogni suo colpo proseguiva oltre il primo nemico. Ora nessuna arma perfora; il testo dello shop è aggiornato.
- Detriti e nave tesoro si possono colpire appena se ne vede un pezzo (prima serviva il centro dentro lo schermo e i colpi passavano su quelli al bordo).
- Il boss ancora in ingresso ferma i colpi senza subire danno, invece di farsi attraversare.
- Capitali e confini fuori posto dopo una partita: in Difesa la Terra gira e all'uscita la rotazione restava. Ora torna allineata (giro più corto) a confini, capitali, satelliti e mappa.
- Nomi in italiano per Città del Vaticano e Lubiana.

## v21 · 2026-11-26

Correzioni sulla v20 (`07b5b31`).

- Vista globo iniziale e pulsante Globale: la Terra entra tutta nell'inquadratura (distanza calcolata dal FOV più stretto e dal rapporto d'aspetto, con un piccolo margine sull'atmosfera) ed è centrata sull'Italia (42°N, 12,5°E). `setView` di Leaflet resta allineato alla camera.
- I colpi si fermano al primo nemico toccato, salvo pierce; ogni proiettile danneggia ogni nemico al massimo una volta (id tenuti sul colpo). Si prende l'impatto più vicino sul segmento percorso. Boss e navi tesoro usano il raggio visibile (anelli compresi).
- Su telefono, con una scheda `.et-card` aperta, il bersaglio è centrato nell'area libera: sopra la scheda in portrait, accanto in landscape, con `camera.setViewOffset` misurato sulla card. L'offset si aggiorna al ridimensionamento e si toglie quando la scheda si chiude.


## v20 · 2026-11-25

Applicate tutte le voci dell'audit su v19 (`eae3f25`), con i numeri di Math_Calc e le note di QA_Docs e UI_UX.

### Bug
- Superficie: la mappa Leaflet nasce già con `setView`, niente più errori «Set map center and zoom first».
- Niente più perdite di memoria GPU (scintille, `retry`, mirino, anello lunare, onda d'urto).
- Ricerca: l'esplosione non colpisce di nuovo il nemico colpito in pieno (niente doppio danno).
- Il cono della torretta resta scritto mentre la si trascina.
- I colpi perforanti non saltano più il secondo nemico; collisioni sul segmento percorso (il Mitra non attraversa i bersagli).
- La Rosa rispetta la sua gittata.
- Gelo: lo scudo della Terra resta visibile e attivo.
- Storico e record si salvano già quando la Terra esplode, anche con la memoria del browser piena o bloccata.
- Pausa automatica quando la scheda passa in background; densità dei pixel aggiornata al cambio di schermo.
- `dispose()` completo e un solo raycast per movimento del dito.

### Prestazioni
- CSS estratto dal bundle (circa 65 KB in meno nel JS, niente più doppio `<style>`).
- In Difesa niente propagazione SGP4, orbite, mappa ed etichette a ogni frame; Sole e Luna 1 volta al secondo.
- Geometrie e materiali condivisi per scintille, proiettili, colpi ostili e nemici; archi di avanzamento senza ricreare geometrie.
- Sfere di Luna, nubi e atmosfera più leggere sui telefoni.

### Bilanciamento
- Numeri nuovi per cannone, testate, torrette, bonus e nave tesoro (vedi `defense-balance.ts`).
- Livello massimo 12, crescita del costo per livello 1,22, fino a 10 torrette.
- Mitra: la cadenza non si perde più per l'arrotondamento al frame.
- Boss: raggio massimo 0,75, sempre fuori dall'orbita della Luna, avvicinamento uguale in verticale e in orizzontale, colpi che smettono di crescere dall'ondata 10.
- Col Gelo torrette e missili continuano a sparare.

### Interfaccia
- Tutorial di 3 passi al primo avvio con «Non mostrare più».
- Pulsante Pausa con Riprendi ed Esci dalla partita.
- HUD con etichette chiare (O1, 100 HP, 0 pt, Rec), icone distinte nello shop, Cadenza in percentuale.
- Guida della Difesa in 4 punti numerati, leggibile anche in orizzontale.
- Focus visibile, dialoghi modali con focus intrappolato, controlli nascosti non raggiungibili col Tab, schede dello shop con frecce.
- Tap target da 44 px, testi minimi da 12 px, dock 3×2 sui telefoni stretti, safe area anche ai lati.
- Etichette del globo più leggibili e senza sovrapposizioni con la riga dati e il pulsante Difendi.
- Moto ridotto rispettato anche da scossa della camera e lampo dell'esplosione.

### Repository e PWA
- Rimossi i bundle `app-v4.js` … `app-v19.js` e la cartella di anteprima `docs/__grok`.
- `npm run build:docs` (script `scripts/build-docs.mjs`) al posto del vecchio `css.py`.
- `eslint` ignora `docs/`; puliti gli avvisi in `src/`.
- Service worker: icone in cache, avvio offline anche con parametri nell'indirizzo, HTML e CSS dalla rete prima,
  texture e dati esterni in una cache persistente `earth-assets-v1`, ricarica automatica dopo un aggiornamento.
- Manifest con `id`, `scope` e icona `maskable`; `apple-touch-icon` e descrizione in `index.html`.
- Font di sistema al posto di Barlow / IBM Plex Mono, mai caricati nella build statica.
