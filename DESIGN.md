# Designrichtlinien

Die App orientiert sich in Design, UI und UX stark an **Autodesk Fusion 360**. Fusion ist ausgereift und gut, deshalb gilt bei jedem neuen Bedienelement zuerst die Frage: **Wie löst Fusion das?** Das Muster wird dann für den Touchscreen übertragen, nicht blind kopiert.

## Grundsätze

1. **3D zuerst.** Die Zeichenfläche ist das Hauptwerkzeug. Bedienelemente schweben darüber und nehmen so wenig Platz wie möglich.
2. **Direkt am Objekt arbeiten.** Wo es möglich und intuitiv ist, läuft die Bedienung im 3D-Raum über Griffe, Maße und Kontext am Objekt statt über Menüs. Maße antippen, Griffe ziehen, Pfeile am Rohr. Dialoge sind die Ausnahme.
3. **Sichtbar nur, was gerade gilt.** Griffe, Symbole und Leisten erscheinen zur Auswahl. Der Rest ist eingeklappt.
4. **Vorher zeigen, was geht.** Vorschau läuft beim Ziehen live mit. Was nicht geht, wird blass und sagt beim Antippen, warum.
5. **Finger sind das Maß.** Die App läuft als PWA auf dem iPhone. Alles muss mit einem Finger gehen, Maus und Hover sind Zugaben.
6. **Keine harten Wechsel.** Wo es möglich und sinnvoll ist, gehen Zustände animiert ineinander über, statt umzuspringen: Griffe, Ringe, Maße, Leisten, Auswahl und Ansicht. Was erscheint, blendet ein, was verschwindet, blendet aus, was sich verwandelt, wächst oder schrumpft dabei. Beispiel: Beim Anfassen eines Drehbogens wächst er zum Ring, die übrigen Griffe blenden aus.

## Aufbau der Oberfläche

| Ort | Inhalt | Vorbild in Fusion |
|---|---|---|
| Oben links | Menü, Projektmanager, Rückgängig, Wiederholen | Anwendungsleiste |
| Links | Projektmanager (Objektbaum) | Browser |
| Oben rechts | Ansichtswürfel mit XYZ, Häuschen, Dreiecken | ViewCube |
| Unten Mitte | Navigationsleiste | Navigationsleiste |
| Über der Navigationsleiste | Leiste der aktuellen Auswahl | Kontextmenü, Befehlsoptionen |
| Unten | Reiter 3D, Biegen, Einstellungen | Arbeitsbereiche |

## Farben

Alle Farben stehen als Variablen in `style.css`, für Hell und Dunkel. Keine festen Farbwerte in neuen Regeln.

| Zweck | Variable | Hell | Dunkel |
|---|---|---|---|
| Hintergrund | `--bg` | `#e6e7e9` | `#1e2023` |
| Flächen, Menüs | `--card` | `#f6f6f7` | `#2a2c30` |
| Text | `--text` | `#1c1e21` | `#e9eaec` |
| Nebentext, Symbole | `--muted` | `#5a6068` | `#a3a8af` |
| Linien | `--line` | `#cdd0d4` | `#3d4046` |
| Akzent (Fusion-Blau) | `--accent` | `#0a7cbd` | `#38b0ea` |
| Akzent, weich | `--accent-soft` | `#dcecf6` | `#15384b` |
| Zeichenfläche | `--canvas-top` → `--canvas-end` | `#eff1f3` → `#d7dbdf` | `#36393e` → `#25272a` |

- **Achsen:** X rot, Y grün, Z blau, überall gleich (`--ax-x`, `--ax-y`, `--ax-z`).
- **Akzent** heißt aktiv, gewählt oder antippbar. Nicht zur Dekoration verwenden.
- **Rot** nur für Löschen und Fehler. **Orange** (`--mark`) nur für Biegemarken und Winkel.
- `--canvas` und `PAL.fog` in `app.js` müssen zur Mitte des Verlaufs passen.

## Symbole

- Nur Linien-Symbole als SVG: 24er-Raster, keine Füllung, 2 px Strich, runde Enden, `currentColor`. Die Reiter unten nutzen 1,8 px.
- Keine Emojis und keine Sonderzeichen als Symbol, auch nicht im Text von Knöpfen und Meldungen. Dafür gibt es `IC()` in `app.js`. Einzige Ausnahme: 🔒 und ⇄ auf der Zeichenfläche, weil sie dort als Text gezeichnet werden.
- Aussagekräftige Symbole sind Text-Knöpfen vorzuziehen, wo es sinnvoll ist. Text bleibt, wo ein Symbol nicht eindeutig wäre.
- Jeder Knopf ohne Text braucht `title` und `aria-label`.

## Bausteine

**Schwebende Knöpfe (`.flbtn`):** 40 × 40 px, Flächenfarbe, leichter Schatten. Gewählt: Akzent. Nicht nutzbar: blass.

**Navigationsleiste (`.navbar`, `.nvb`):** Knöpfe ohne Rahmen in einer gemeinsamen Pille, Trennstrich zwischen Gruppen. Schalter sind aktiv blau und enden mit erneutem Tippen oder Esc.

**Untermenüs (`.fmenu`):** Alle aufklappenden Menüs sind gleich gebaut: Pfeilmenüs wie „+“, das Menü hinter den drei Strichen, Anzeige und Ebenen.

- Karte mit Flächenfarbe, 12 px Radius, 1 px Linie, Schatten.
- Zeilen (`.mi`) statt einzelner Kästen: 40 px hoch, ohne Rahmen, Symbol links, Text linksbündig.
- Gruppen tragen eine kleine Überschrift (`.mlabel`) und werden mit `.msep` getrennt.
- Die aktive Zeile ist fett und trägt rechts einen Haken.
- Antippen färbt die Zeile kurz mit `--accent-soft`, mit der Maus auch beim Überfahren.
- Tippen daneben oder eine Wahl schließt das Menü.
- Zeilen mit Objekten tragen rechts ein ⋮ mit ihren Aktionen, zum Beispiel Umbenennen. Der Name wird direkt in der Zeile geändert.

**Projektmanager (`.trow`):** Zeilen mit Pfeil, Auge, Farbpunkt, Name, Wert rechts und ⋮ für Aktionen. Auf dem Handy schließt er nach einer Auswahl.

**Auswahl-Leiste (`#bundleBar`):** Gebaut wie die Navigationsleiste: Pille, Knöpfe ohne Rahmen, Trennstrich zwischen Gruppen. Die Überschrift steht ohne Hintergrund darüber. So breit wie ihr Inhalt, sie bricht um: Nichts liegt außerhalb des Bildschirms. Zeigt nur, was zur Auswahl passt.

**Rückfragen:** Nie `confirm()` oder `alert()`. Rückfragen laufen über `ask()`, reine Meldungen über `toast()`.

**Schalter:** Ein-Aus-Einstellungen sind Zeilen mit Schalter rechts, nicht Häkchen (`.swrow`). Häkchen nur für erledigte Arbeitsschritte.

**Raster:** Schriftgrößen 11, 12, 13, 14, 16, 18, 22, 28 px; Ecken 8, 12 px oder rund. Tippflächen sind mindestens 36 px breit.

**Wörter:** „Projektmanager“ für den Objektbaum, „Zange“ für das Profil. „Abbrechen“ verwirft etwas, „Fertig“ beendet ohne Verlust.

**Maße:** Wie im Skizzenmodus: Maßlinie mit Hilfslinien, abgeleitete Maße in Klammern, antippbar und mit eigenem Eingabefeld über der Tastatur. Sie liegen über dem Gimbal und behalten beim Navigieren ihren Platz.

**Auswahl:** Ein gewählter Schenkel zeigt seine Achslinie bis zu beiden Eckpunkten, auch wenn die Achslinie ausgeschaltet ist.

**Drehkugel:** Drehen läuft über eine Kugel aus Ringen in Achsfarben, in 15°-Schritten, vorne kräftig, hinten blass. Ringe tragen keine Griffpunkte, gefasst wird der Kreis selbst. Ringe ohne Sinn entfallen. Am Eckpunkt hält ein Ring den Schenkel auf seiner Achse fest und bewegt den anderen; der Biegering bewegt den Teil dahinter. Der Ring für den Teil davor erscheint nur an 90°-Eckpunkten mit freiem Anfang. Der bewegte Teil leuchtet beim Überfahren und Ziehen auf.

**Griffe:** Dezent, nur bei Auswahl. Nur in den 2D-Ansichten (Vorne, Hinten, Oben, Unten, Rechts, Links) fehlt, was dort nichts bewirken kann: Pfeile, die in die Bildtiefe zeigen, Drehbögen, die man von der Kante sieht, der Ausrichtarm der Tiefenachse; die Verteilen-Leiste nimmt solange eine sichtbare Achse. Im 3D bleiben alle Griffe, wie man auch dreht. Pfeile in Achsfarben. Tippen auf ein Maß geht vor, Ziehen greift den Griff.

## Verhalten

- **Navigation:** Drehen und Zoomen laufen um die Auswahl, ohne Auswahl um die Mitte der Szene. Drehen braucht keinen Knopf: Ein Finger auf freier Fläche dreht.
- **Ansichtswechsel** ändert nur die Blickrichtung, nie Zoom oder Lage. Neu eingepasst wird nur über Häuschen oder Einpassen.
- **Menüs schließen:** Ein Klick außerhalb schließt offene Menüs und den Projektmanager und wirkt sonst nicht; erst der nächste Klick zählt. Ausnahmen: der eigene Knopf, Dialoge, Maßfelder, Rückgängig und Wiederholen beim Projektmanager.
- **Schlösser:** Das Schloss steht nur in der Leiste des gewählten Anfangs- oder Endpunkts, als Symbol ohne Text. In 3D zeigt es den Status am Punkt. Alle Schlösser in 3D, auch an Ebenen, blenden unter einem einstellbaren Maßstab aus (Einstellungen → Anzeige, Vorgabe 0,8 px/mm); das Gewählte bleibt sichtbar.
- **Ebenen sperren:** Das Schloss in der Ebenenzeile des Projektmanagers macht eine Ebene im 3D-Raum unanwählbar und hält ihre Position fest. Sie bleibt löschbar und Fangziel.
- **Beschriftungen:** S1, E1, R1, A und die Bündelzahl hängen an einem Schalter im Auge. Maße, Schlösser und Biegemarken bleiben davon unberührt.
- **Rohr anlegen ist ein Befehl:** Die Leiste führt Schritt für Schritt (Bezug, Versatz, Richtung und Länge). Die Wirkung ist im Raum sofort sichtbar, Abbrechen hinterlässt nichts. Neue mehrstufige Befehle folgen diesem Muster.
- **Messen** läuft nur orthogonal: je Achse ein Maß, kein Diagonalwert. Ohne Eingabe ändert der Befehl nichts und landet nicht im Verlauf. Ein Tipp auf ein Maß stellt den Abstand je Achse ein: Der zuletzt gewählte Punkt ist der gefüllte Festpunkt, der erste wandert. Bewegen lassen sich Fittings, Bestandsstücke, freie Ebenen, Eckpunkte und ungesperrte Rohrenden; was gesperrt ist, bleibt immer fest. Das Maß wird einmalig eingestellt, eine Beziehung entsteht nicht. Bei Ebenen zählt nur der senkrechte Abstand.
- **Untere Leiste:** Sie enthält nur die Knöpfe. Ihr erster Text steht als kleine Beschriftung ohne Hintergrund darüber (`#barTitle`) und nimmt keine Klicks an. Aufforderungen (`.bprompt`) und reine Textleisten bleiben in der Zeile.
- **Griffe rasten auf ganze Maße:** Verschiebepfeile auf ganze Millimeter des Nachbarschenkels, Längenpfeile auf 5 mm. Am Rand bleibt ein Griff genau auf der Mindestlänge stehen, nicht beim letzten Schritt davor.
- **Keine Maßbezüge, vorerst:** Der Code der Maßbezüge liegt hinter `CONSTRAINTS` in `app.js` still, gespeicherte Bezüge wirken nicht. Dauerhaft ist nur die Verbindung von Fitting und Rohrende. Schlösser, Ebenen sperren, Fest/Ausgleich und Fangen sind davon nicht betroffen.
- **Winkel:** Der Biegewinkel liegt zwischen den Schenkeln, der Drehwinkel quer zum ankommenden Schenkel und gilt zur nächsten Achsrichtung. Beide haben im Auge einen eigenen Schalter und erscheinen am gewählten Eckpunkt immer.
- **Bündel:** Das erste Parallelrohr legt die Richtung fest, danach gibt es nur noch deren Pfeil. Beim Drehen läuft das Bündel stufenlos mit und rastet nur auf 90°. Ein neues Rohr hängt ab dem Drücken am Zeiger; zu nah ist es rot und wird beim Loslassen verworfen.
- **Schrägstücke:** Ist ein Stück im Bündel für zwei 90°-Bögen zu kurz, beim Lagewechsel wie an normalen Ecken, wird es automatisch schräg: 45°, dann 30°, dann 15°. Jedes Rohr nimmt seinen steilsten passenden Winkel. Stücke der Länge 0 entfallen. Lagen, die nie gehen, sind blass und nennen beim Tippen den Grund.
- **Parallelrohre anlegen** geht nur über das Plus-Menü. Ohne Auswahl fragt die Leiste nach dem Rohr. Am Gimbal setzt das runde Plus das nächste Rohr. Bestehende Bündel zeigen ihre Griffe direkt beim Tipp auf den Anfang.
- **Rohrtyp und Zange:** Der Rohrtyp ist Material mit Durchmesser und nennt seine Zange. Die Zange ist das Werkzeug mit Radius und Mindest-Gerade. Jedes Rohr hat seinen eigenen Rohrtyp, Parallelrohre den ihres Ankerrohrs.
- **Einstellungen** sind Listen wie der Projektmanager: Zeile tippen klappt die Werte auf, ⋮ hat Umbenennen und Löschen, Umbenennen geschieht direkt in der Zeile. Eingesetztes lässt sich nicht löschen, die Meldung nennt den Grund.
- **Bauteil-Editor:** Ganzseitig, eigene Ansicht wie die 3D-Ansicht (drehen, schieben, zoomen, Ansichten, Einpassen). Keine Automatik: Achsen, Punkte, Drehpunkt und Anschlüsse legt man von Hand fest, die Geometrie ist nur Fanghilfe. Oben Liste, Rückgängig, Wiederholen, ✓ Fertig; unten Symbolleiste in Ablauf-Reihenfolge Messen, Achse, Punkt, Anschluss | Durchsicht, Ansicht, Einpassen; darüber die Befehlsleiste, beim Punkt mit den Arten Fangpunkt, Mitte, Schnittpunkt. Die Liste nennt oben den Ablauf. Unter der Maus hebt sich hervor, was der Befehl annimmt, mit Beschriftung; verdeckte Elemente zählen nur in der Durchsicht. Achsen strichpunktiert in Achsfarbe, durchgehend über das ganze Modell und darüber hinaus in beide Richtungen, die festlegenden Punkte als Punkte. Beschriftungen (Achsen, Punkte, Drehpunkt, Ø, Maße) werden abgesetzt verteilt: jede sucht einen freien Platz weg von der Modellmitte, neben Liste, Karten und Leisten, und zeigt mit einer dünnen Linie auf ihr Element; auch Maßzahlen, ihre Linie zeigt auf die Mitte des Maßes. Abstand zum Element großzügig (ab etwa 64 px); zuerst wird ein Platz neben dem Modell gesucht, erst wenn dort keiner ist, auch über dem Modell. Drehpunkt: oranges Fadenkreuz im Ring mit „↻ Drehpunkt“. Anschluss: Punkt am Rohrende, Pfeil nach außen mit Nummer, durchsichtiges Rohrstück; gewählt das Maß „… vom Drehpunkt“ entlang der Achse und Ø. Werte auf 0,01 mm. Auf dem Handy sitzt die Karte über der Befehlsleiste.
- **Fittings:** CLA-6M und CUA-6M kommen mit der App, weil es keine Übertragung zwischen Geräten gibt. Weitere GLB-Dateien liegen als Bibliothek in den Einstellungen. Achsen, Drehpunkt und Anschlüsse legt man im Bauteil-Editor von Hand fest (siehe oben). Der Anschlusspunkt sitzt am Rohranschlag, die Länge stimmt so ohne Zugabe. Pfeile und Drehbögen sitzen an einem Griff, angedockt gibt es nur den Bogen um das Rohr, mit zwei Rohren keinen. Mit Drehpunkt aus dem Bauteil-Editor dreht ein Fitting frei um X, Y, Z durch diesen Punkt; eine ältere Drehachse gibt nur ihren einen Ring; angedockt bleibt das Rohr die Achse, sonst löste sich das Fitting vom Rohr. Fittings richten sich nie aneinander aus. Modelle liegen in IndexedDB, ihre Lage im Projekt.
- **Objekte:** Rohr, Fitting, Ebene und Bestandsstück sind Objekte. Ein Tipp wählt beim Rohr den Teil, der Doppeltipp oder „Ganzes Rohr“ das Objekt. Die Leiste folgt immer demselben Aufbau: Objektbezogenes, dann Kopieren, Sperren und Löschen als Symbole. Ein einziger Griff wie in Fusion: Pfeile verschieben, kurze Bögen in Achsfarbe außen drehen, es gibt keinen Modus. Die Bögen sind schmaler und tragen an beiden Enden eine Spitze. Pfeile, die in die Tiefe zeigen, sind blasser und dünner und liegen unter den vorderen. Angefasst wächst ein Bogen in 250 ms zum ganzen Ring, die übrigen Griffe blenden aus; beim Loslassen läuft es rückwärts. Nach einer neuen Auswahl blendet der Griff ein.
- **Punkt oder Objekt:** Ein Punkt bewegt nur sich, die Schenkel gleichen aus. Das ganze Rohr bewegt nur die Auswahl „Ganzes Rohr“. Ein Rohr mit festem Punkt bleibt als Ganzes stehen.
- **Referenz:** In Mehrfachauswahl, Messen, Ausrichten und Verteilen bleibt das Zuletztgewählte stehen. Es ist kräftiger markiert.
- **Mehrfachauswahl:** Knopf in der Navigationsleiste, langes Drücken auf ein Objekt, Shift oder Cmd mit Klick, Halten plus zweiter Finger. Langes Drücken auf freier Fläche zieht ein Rechteck: nach rechts nur Umschlossenes, nach links auch Berührtes. Ein Tipp in den freien Raum beendet sie.
- **Kopieren** läuft als Befehl: Referenzpunkt, dann Zielpunkt. Eine durchsichtige Kopie hängt am Mauszeiger oder, mit „Orthogonal“, am Gimbal. Auf dem Touchscreen gibt es keinen Zeiger: Dort setzt der Tipp die Kopie, danach wird sie mit Gimbal und Maßen verschoben. „Orthogonal“ (Winkelsymbol) zeigt stattdessen X, Y, Z mit Maßlinien und Pfeilen; die Maße im Bild sind die Eingabe, die Leiste hat keine eigenen Felder. Ein Tipp auf den orangen Zielpunkt oder das Klemmbrett setzt die Kopie; jede weitere rückt um denselben Abstand weiter, gemessen ab der letzten Kopie. Der Befehl bleibt offen, jeder weitere Tipp oder „Einfügen“ setzt die nächste Kopie, jede ist ein eigener Rückgängig-Schritt. ✓ beendet, ✕ bricht ab; Leiste: Orthogonal, Einfügen, Fertig. Getippt wird nur auf Fangpunkte. Es gibt kein Duplizieren mehr. Kopien sind nie gesperrt. Verbindungen kommen nur mit, wenn beide Seiten kopiert werden. Die Zwischenablage gilt über Projekte hinweg.
- **Ausrichten und Verteilen** laufen im Raum, ab zwei gewählten Objekten. Am Bezugspunkt sitzt ein kleines Achsenkreuz wie der Ursprung; jeder Arm zeigt in seine 3D-Richtung, sein Endgriff ist der Fluchtgriff dieser Achse. Kreuz und Kettenschilder suchen sich die nächste freie Stelle neben Pfeilen, Bögen, Griffen und Maßzahlen; ist das Kreuz verrückt, zeigt eine feine Linie zum Bezugspunkt. Während einer Vorschau bleiben sie auf dem Bildschirm stehen, samt Breite der Leiste, damit der Griff nicht unter der Maus wegzieht. Überfahren mit der Maus oder Drücken lässt die Teile probeweise an ihre neue Stelle gleiten, die alte Lage bleibt als blasser Schatten; gespeichert wird erst beim Ausführen; Klick oder Loslassen auf dem Griff führt aus, Wegziehen bricht ab. Ein Griff ist blass, wenn schon alles fluchtet oder Teile danach aufeinander lägen; antippen sagt warum. Ab zwei Objekten sitzt sofort eine kleine Leiste bei ihnen, auch wenn sie noch nicht fluchten: Achse (von selbst die größte sichtbare Ausdehnung, ein Tipp wechselt), Abstand (ein Feld für alle Lücken, „≠“ wenn ungleich), „=“ (gleichmäßig zwischen den äußeren). Gemessen und geschoben wird nur entlang dieser Achse, Versatz quer dazu bleibt. Alles wirkt sofort, gleitet in die neue Lage und ist ein Rückgängig-Schritt. Orange Punkte sind die Bezugspunkte, ein Tipp wechselt sie reihum. Einmalig, keine Beziehung.
- **Verbindungen:** Rohrende und Anschluss sind ein Knoten. Andocken verbindet, „Lösen“ trennt, Wegziehen nicht. Die erste Verbindung gibt die Richtung vor, weitere Rohre müssen den Anschluss nur erreichen. Ist das andere Ende eines Rohrs frei und würde es kippen, wandert es als Ganzes mit. Was nicht ausgleichen kann, bleibt beim letzten gültigen Stand. Ein Fitting mit zwei Rohren lässt sich nicht drehen. Beim Andocken dreht es nur so weit, bis der Anschluss aufs Rohr zeigt; passt er schon, bleibt die Drehung. „Ganzer Strang“ wählt alles Verbundene.
- **Sofort setzen:** Der Bezugspunkt genügt, Rohr, Fitting und Bestandsrohr entstehen ohne OK. Fitting und Bestandsrohr behalten danach Maße vom Bezugspunkt und Griffe, bis ein Tipp in den leeren Raum beendet; ein Fangpunkt antippen setzt sie dorthin. Am Rohrende verbindet sich das Fitting gleich. Ein Rohr ab Anschluss ist gleich verbunden.
- **Zurück in die Ausgangslage:** Beim Ziehen rastet alles wieder an der Stelle ein, wo es losging, auch ohne Fangpunkte.
- **Ansicht:** Sie bleibt beim Bearbeiten stehen und folgt erst, wenn etwas aus dem Bild läuft. „Einpassen“ nimmt zuerst die Auswahl, der nächste Tipp alles.
- **Raster:** Es liegt auf Z = 0 und reicht bis zum Ursprung.
- **Griffe an kleinen Objekten** beginnen außerhalb des Objekts.
- **Bestandsstücke** erfassen vorhandene Leitungen: blass und durchsichtig, nur verschieben und drehen. Sie sind Fangziel und erscheinen nicht unter „Biegen“.
- **Einfügen nur an Fangpunkten:** Freies Tippen auf eine Arbeitsebene gibt es nicht mehr. Der Ursprung ist ein Fangpunkt, solange er sichtbar ist. Ist er ausgeblendet und gibt es sonst keinen Punkt (leeres Projekt), erscheint er für die Dauer des Einfügens oder Kopierens und ist danach wieder weg; die Einstellung bleibt.
- **Kamera-Drehpunkt:** Steht ein Gimbal (Objekte, Fitting, Kopie), drehen und zoomen Ansicht und Würfel um seine Mitte; sonst um die Auswahl.
- **Maße unter der Maus:** Überall, wo ein Maß antippbar ist, auch in Befehlen, wird der Zeiger zum Finger und das Maß hebt sich hervor.
- **Fangen beim Verschieben** prüft alle Punkte des Gezogenen: Enden, Eckpunkte, Anschlüsse und Mitte. Es fängt der Punkt, der einem Ziel am nächsten kommt, die Hilfslinie geht von ihm aus.
- **Zeiger in Befehlen:** Über einem wählbaren Punkt wird er zur Hand und der Punkt wächst, wo ein Klick frei setzen würde, erscheint ein Fadenkreuz.
- **Ausgeblendet** heißt nicht da: nicht wählbar, kein Fangziel. Gilt auch für den Ursprung.
- **Fitting und Rohr an einer Stelle:** Der Tipp gilt dem Fitting. Der zweite Tipp fragt in einer kleinen Liste, ob Rohr, Schenkel oder Ende gemeint war.
- **Quicktipps:** Symbole zeigen beim Überfahren mit Maus oder Trackpad nach 0,5 s ein kleines Schild mit Name und Kürzel. Neue Symbole brauchen deshalb immer `aria-label` oder `title`. Auf Touch gibt es keine Quicktipps.
- **Rohrfarbe** wird im Projektmanager am Farbpunkt des Rohrs gewählt, nicht in der 3D-Ansicht.
- **Rückgängig** nimmt immer den letzten Befehl zurück, egal an welchem Rohr oder Projekt. Auch Anlegen, Löschen, Umbenennen und Ausblenden zählen dazu.
- **Bewegung:** Kurz und sachlich, etwa 300 ms. `prefers-reduced-motion` wird beachtet.
- **Rückmeldung:** Jeder Knopf zeigt das Antippen. Hover ist nur Zugabe, weil es auf dem iPhone keinen gibt.
- **Meldungen:** Kurz und auf Deutsch, in der Sprache des Handwerks. Sagen, was zu tun ist.
- **Parallelrohre** beginnen und enden orthogonal versetzt, jeder Schenkel läuft exakt parallel zum Quellrohr. Die Schenkellängen passen sich an. Nachgeben darf nur der Abstand auf schrägen Stücken.
- **Neue Biegungen** entstehen nur, wenn bestehende Schenkel es nicht lösen können.
- **Das Rohr verformt sich nie.** Passen die Bögen nicht auf die Schenkel, bleibt der letzte passende Stand.
- **Die App zoomt nie als Ganzes.** Pinch wirkt nur in der 3D-Ansicht.

## Bewusst anders als Fusion

| Fusion | App | Grund |
|---|---|---|
| Browser bleibt offen | Projektmanager schließt beim Klick außerhalb | Auf dem Handy braucht die 3D-Ansicht den Platz |
| Große Werkzeugleiste oben | Menüs und Auswahl-Leiste | Zu viel Platz auf dem Handy |
| Timeline unten | Rückgängig und Wiederholen | Bräuchte einen großen Umbau |
| Gelenke als eigener Befehl | Andocken verbindet sofort | Ein Rohr im Fitting soll drinbleiben, das erwartet man |
| Gruppen | Mehrfachauswahl und Strang | Gruppen überraschen bei Bewegung |
| Doppelklick zum Umbenennen | ⋮ in der Zeile | Der erste Tipp wählt schon aus |
| Knopf für Orbit | Kein Knopf | Ein Finger dreht ohnehin |
| Menü am ViewCube | Kein Menü | Häuschen und Einpassen reichen |
| Perspektive | Nur Parallelprojektion | Die Zeichnung rechnet orthografisch |
| Drehpfeile an allen Flächen | Nur oben und unten | Die Kamera kann nicht um die Blickachse rollen |

## Offen

- Befehlsfenster mit OK und Abbrechen, wie Fusions Dialoge rechts. Vorerst zurückgestellt.
- Markierungsmenü als langes Drücken, erst wenn das Befehlsfenster steht.
