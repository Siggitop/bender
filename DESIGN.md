# Designrichtlinien

Die App orientiert sich in Design, UI und UX stark an **Autodesk Fusion 360**. Fusion ist ausgereift und gut, deshalb gilt bei jedem neuen Bedienelement zuerst die Frage: **Wie löst Fusion das?** Das Muster wird dann für den Touchscreen übertragen, nicht blind kopiert.

## Grundsätze

1. **3D zuerst.** Die Zeichenfläche ist das Hauptwerkzeug. Bedienelemente schweben darüber und nehmen so wenig Platz wie möglich.
2. **Direkt am Objekt arbeiten.** Maße antippen, Griffe ziehen, Pfeile am Rohr. Dialoge sind die Ausnahme.
3. **Sichtbar nur, was gerade gilt.** Griffe, Symbole und Leisten erscheinen zur Auswahl. Der Rest ist eingeklappt.
4. **Vorher zeigen, was geht.** Vorschau läuft beim Ziehen live mit. Was nicht geht, wird blass und sagt beim Antippen, warum.
5. **Finger sind das Maß.** Die App läuft als PWA auf dem iPhone. Alles muss mit einem Finger gehen, Maus und Hover sind Zugaben.

## Aufbau der Oberfläche

| Ort | Inhalt | Vorbild in Fusion |
|---|---|---|
| Oben links | Menü, Browser, Rückgängig, Wiederholen | Anwendungsleiste |
| Links | Browser (Objektbaum) | Browser |
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
- Keine Emojis und keine Sonderzeichen als Symbol. Einzige Ausnahme bisher: das 🔒 in Maßzahlen, weil es auf die Zeichenfläche geschrieben wird.
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

**Browser (`.trow`):** Zeilen mit Pfeil, Auge, Farbpunkt, Name, Wert rechts und ⋮ für Aktionen. Auf dem Handy schließt er nach einer Auswahl.

**Auswahl-Leiste (`#bundleBar`):** Gebaut wie die Navigationsleiste: Pille, Knöpfe ohne Rahmen, kleine Überschrift in Nebenfarbe, Trennstrich zwischen Gruppen. Eine Zeile, seitlich wischbar, so breit wie ihr Inhalt. Zeigt nur, was zur Auswahl passt.

**Rückfragen:** Nie `confirm()` oder `alert()`. Rückfragen laufen über `ask()`, reine Meldungen über `toast()`.

**Schalter:** Ein-Aus-Einstellungen sind Zeilen mit Schalter rechts, nicht Häkchen.

**Maße:** Wie im Skizzenmodus: Maßlinie mit Hilfslinien, abgeleitete Maße in Klammern, antippbar und mit eigenem Eingabefeld über der Tastatur. Sie liegen über dem Gimbal und behalten beim Navigieren ihren Platz.

**Auswahl:** Ein gewählter Schenkel zeigt seine Achslinie bis zu beiden Eckpunkten, auch wenn die Achslinie ausgeschaltet ist.

**Drehkugel:** Drehen läuft über eine Kugel aus Ringen in Achsfarben, in 15°-Schritten, vorne kräftig, hinten blass. Ringe ohne Sinn entfallen.

**Griffe:** Dezent, nur bei Auswahl. Pfeile in Achsfarben. Tippen auf ein Maß geht vor, Ziehen greift den Griff.

## Verhalten

- **Navigation:** Drehen und Zoomen laufen um die Auswahl, ohne Auswahl um die Mitte der Szene. Drehen braucht keinen Knopf: Ein Finger auf freier Fläche dreht.
- **Ansichtswechsel** ändert nur die Blickrichtung, nie Zoom oder Lage. Neu eingepasst wird nur über Häuschen oder Einpassen.
- **Menüs schließen:** Ein Klick außerhalb schließt offene Menüs und den Projektmanager und wirkt sonst nicht; erst der nächste Klick zählt. Ausnahmen: der eigene Knopf, Dialoge, Maßfelder, Rückgängig und Wiederholen beim Projektmanager.
- **Schlösser:** Das Schloss steht nur in der Leiste des gewählten Anfangs- oder Endpunkts, als Symbol ohne Text. In 3D zeigt es den Status am Punkt.
- **Ebenen sperren:** Das Schloss in der Ebenenzeile des Projektmanagers macht eine Ebene im 3D-Raum unanwählbar und hält ihre Position fest. Sie bleibt löschbar und Fangziel.
- **Beschriftungen:** S1, E1, R1, A und die Bündelzahl hängen an einem Schalter im Auge. Maße, Schlösser und Biegemarken bleiben davon unberührt.
- **Rohr anlegen ist ein Befehl:** Die Leiste führt Schritt für Schritt (Bezug, Versatz, Richtung und Länge). Die Wirkung ist im Raum sofort sichtbar, Abbrechen hinterlässt nichts. Neue mehrstufige Befehle folgen diesem Muster.
- **Messen** läuft nur orthogonal: je Achse ein Maß, kein Diagonalwert. Der Befehl ändert nichts und landet nicht im Verlauf. Bei Ebenen zählt nur der senkrechte Abstand.
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
| Doppelklick zum Umbenennen | ⋮ in der Zeile | Der erste Tipp wählt schon aus |
| Knopf für Orbit | Kein Knopf | Ein Finger dreht ohnehin |
| Menü am ViewCube | Kein Menü | Häuschen und Einpassen reichen |
| Perspektive | Nur Parallelprojektion | Die Zeichnung rechnet orthografisch |
| Drehpfeile an allen Flächen | Nur oben und unten | Die Kamera kann nicht um die Blickachse rollen |

## Offen

- Befehlsfenster mit OK und Abbrechen, wie Fusions Dialoge rechts. Vorerst zurückgestellt.
- Markierungsmenü als langes Drücken, erst wenn das Befehlsfenster steht.
