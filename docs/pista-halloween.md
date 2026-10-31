# Pista Halloween — "Collina Stregata" (progetto)

Pista notturna a tema Halloween. Si aggiunge alle 4 piste esistenti, che restano invariate.

## Dati generali

| Voce | Valore |
|---|---|
| Lunghezza giro | circa 1.500 m (le piste attuali: 600–800 m) |
| Larghezza strada | 22 m (metà larghezza 11), contro i 14 m attuali; 16 m dentro la villa e nella grotta |
| Dislivello | da −6 m (fondo grotta) a +11 m (villa) |
| Giri consigliati | 2 (circa 50–60 s a giro) |
| Ora | notte, luna piena, nebbia viola bassa |
| Aderenza | normale; terriccio fuori pista; pavimento della villa un po' più scivoloso |

## Tracciato, sezione per sezione

Coordinate dei punti di controllo in metri: `x` verso est, `z` verso sud, `y` = altezza.

| # | Sezione | Punti (x, z, y) | Cosa succede | Oggetti di scena |
|---|---|---|---|---|
| 1 | **Viale delle zucche** (partenza) | (0,0,0) → (120,0,0) | Rettilineo largo in piano, griglia e traguardo | Arco del traguardo con zucche, lanterne-zucca a bordo, cancello di ferro del paese |
| 2 | **Tornante della strega** | (200,−30,2) → (230,−110,8) | Curva ampia a destra in salita, ideale per il drift | Alberi spogli, corvi, calderone fumante, cartello storto |
| 3 | **Giardino della villa** | (180,−180,10) → (100,−190,10) | Curva lunga a sinistra sul crinale | Siepe incolta, fontana rotta, statue, cancello che si apre |
| 4 | **Villa abbandonata** (al coperto) | (40,−200,11) → (−10,−230,11) → (−60,−200,11) | Si entra dal portone: salone d'ingresso, curva a S tra le colonne, uscita dalla vetrata posteriore | Pavimento a scacchi, lampadari, candelabri, quadri, armature, ragnatele, fantasmi che attraversano la stanza |
| 5 | **Discesa e salto sulla cripta** | (−110,−210,4) | Discesa ripida, pannello turbo e trampolino sopra il tetto di una cripta | Scalinata del giardino, lampioni spenti, trampolino di assi |
| 6 | **Cimitero** | (−180,−170,0) → (−220,−110,0) | Chicane larga tra le lapidi, poi curva ampia attorno al mausoleo | Lapidi, croci, recinto di ferro, mausoleo, fuochi fatui, mani che spuntano dalla terra |
| 7 | **Grotta** (al coperto) | (−200,−50,−2) → (−150,−10,−6) → (−120,40,−3) | Entrata nella collina, discesa a spirale fino al fondo, risalita verso l'uscita | Stalattiti, cristalli verdi luminosi, pozza d'acqua, pipistrelli, ossa |
| 8 | **Ponte sul burrone** | (−60,60,1) | Ponte di legno sopra un burrone pieno di nebbia | Ponte di assi e corde, nebbia sotto, lanterne |
| 9 | **Curva finale** | (−20,30,0) → partenza | Curva larga a destra che riporta sul viale | Zucche giganti, spaventapasseri |

## Elementi di gioco

- **Cristalli sorpresa**: 3 file, cioè prima del tornante, dopo la villa e all'uscita della grotta.
- **Pannelli turbo**: sul viale, prima del salto della cripta e nella risalita della grotta.
- **Gemme**: lungo le traiettorie più difficili, per esempio all'interno delle curve del cimitero e sul ponte.
- **Scorciatoia** (fase successiva): attraverso il mausoleo, solo con un turbo.
- **Salti con trick**: il trampolino della cripta, più un piccolo dosso all'uscita della grotta.

## Cosa va aggiunto al motore di gioco

1. **Dislivelli**: la strada segue l'altezza `y` dei punti; kart, avversari, oggetti e telecamera seguono il terreno, con un leggero sopraelevamento nelle curve.
2. **Larghezza variabile** per sezione (22 m all'aperto, 16 m al coperto).
3. **Ambienti al coperto** (villa e grotta): pareti, soffitto, luci interne; la telecamera non deve passare attraverso i muri.
4. **Luci notturne leggere per il telefono**: luna, fari dei kart e materiali luminosi al posto di tante luci vere.
5. **Più punti sul tracciato** (da 600 a circa 1.200) per una pista più lunga.

## Oggetti 3D: come procediamo

1. **Prima versione**: tutto con forme semplici generate dal codice, per provare tracciato e guida.
2. **Poi**: sostituiamo un oggetto alla volta con modelli gratuiti CC0 in formato glTF (KayKit Halloween Bits, Kenney Graveyard Kit) o fatti da noi con Blockbench o Blender.
3. La villa e la grotta le costruiamo su misura, perché devono combaciare con la strada.
