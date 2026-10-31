# Rohrbiegen

Web-App (PWA) zum Aufmessen von Rohrleitungen im Achsmaß und Biegen mit der Handbiegezange.
Zeigt das Rohr in 3D, berechnet Zuschnitt und Strichpositionen und führt Schritt für Schritt durch die Biegungen.
Läuft im Browser, auch offline, und lässt sich auf dem iPhone über „Zum Home-Bildschirm“ wie eine App installieren.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `style.css` | Oberfläche |
| `app.js` | Eingabe, 3D-Ansicht, Gimbal, Anleitung, Zangen |
| `geometry.js` | Biegerechnung (Tangente, Bogen, Zuschnitt, Strichpositionen, Kollisionen) |
| `site.js` | Baustelle: Raum (Grundriss → Wände, Boden, Decke), Schellen nach Abstandsregeln, Bohrpunkte, Rohrbündel (Parallelrohre), Zuschnitt aus Stangen |
| `version.js` | Versionsnummer (bei jeder Änderung erhöhen) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Offline-Betrieb und Installation als App |

Es gibt keinen Build-Schritt und keine Abhängigkeiten – die Dateien werden direkt ausgeliefert.

## Lokal starten

```bash
python3 -m http.server 8765
```

Dann `http://localhost:8765` öffnen. Im selben WLAN geht auch `http://<IP-des-Macs>:8765` vom iPhone aus
(dort ohne Offline-Betrieb, dafür braucht iOS HTTPS).

## Veröffentlichen mit GitHub Pages

Einstellungen → Pages → „Deploy from a branch“ → Branch `main`, Ordner `/ (root)`.
Die App ist danach unter `https://<benutzername>.github.io/<repository>/` erreichbar.

Bei jeder Änderung die Versionsnummer in `version.js` um 1 erhöhen. Die App zeigt sie an (oben rechts bzw. im Reiter
„Zangen“), vergleicht sie beim Öffnen mit dem Server und blendet bei einer neueren Version „Neue Version … – tippen zum Laden“ ein.

## Bedienung in Kürze

Reiter: **3D · Biegen · Einstellungen**. Ein Projekt ist eine Szene mit mehreren Rohren und Referenzebenen.

- **3D:** Gerade antippen = Längenpfeil und Rohrfarbe, Eckpunkt antippen = Drehringe und Lage des Bündels, anderes Rohr antippen = aktiv. Griff am Ende ziehen oder antippen führt fort. Maße als technische Bemaßung in drei Stufen (👁): Ruhig, Auswahl, Alle; was zur Auswahl gehört, erscheint beim Antippen; optional Gesamtmaße und Winkelmaße.
- **Oberfläche:** Projekt und neues Projekt liegen im Menü hinter den drei Strichen oben links, Rückgängig und Wiederholen schweben daneben. Die App selbst zoomt nicht, Pinch wirkt nur in der 3D-Ansicht.
- **Designrichtlinien:** Stehen in [DESIGN.md](DESIGN.md), Vorbild ist Fusion 360.
- **Aussehen:** Neutrale Grautöne und Fusion-Blau, Linien-Symbole in den Reitern. Mit der Maus hebt sich hervor, was man gleich anklickt, und jeder Knopf zeigt das Antippen.
- **Browser:** Das Baum-Symbol oben links öffnet die Liste von Projekt, Rohren, Punkten, Schenkeln, Parallelrohren und Ebenen. Antippen wählt aus, das Auge blendet aus. Ausgeblendetes zählt beim Biegen weiter. Das ⋯ einer Zeile benennt um, löscht, dupliziert ein Projekt oder macht ein Parallelrohr zum eigenen Rohr.
- **Navigationsleiste:** Unten in der Mitte wie in Fusion: Verschieben und Zoomen schalten um, sodass ein Finger überall navigiert und Griffe ruhen; gedreht wird auf der freien Fläche oder am Würfel; nochmal antippen oder Esc beendet das. Dazu Einpassen, Anzeige und „+“.
- **Ansichtswürfel:** Oben rechts wie in Fusion 360: Flächen, Kanten und Ecken antippen, Würfel ziehen zum Drehen. Das Häuschen führt zur Startansicht, in Flächenansichten führen Dreiecke zur Nachbarfläche, oben und unten drehen Pfeile um 90°.
- **Navigation:** Drehen und Zoomen laufen um die aktuelle Auswahl (Schenkel, Eckpunkt, Punkt, Ebene, Parallelrohr), ohne Auswahl um die Mitte der Szene. Nach dem Navigieren bleibt die Ansicht stehen; neu eingepasst wird beim Wählen einer Ansicht.
- **Parallelrohre:** „+ Parallelrohr“ setzt mit einem Klick ein weiteres Rohr im Abstand des ersten. „Als eigenes Rohr“ und „Alle als eigene Rohre“ lösen Parallelrohre vom Hauptrohr; sie behalten ihre Lage, und Rückgängig nimmt das zurück.
- **Versatz:** Schenkel antippen, das Versatz-Symbol in der Navigationsleiste drücken. Der Punkt in der Mitte des X legt die Lage fest, jeder Arm steht für Rohrseite und Richtung: Der Rohrteil auf der Seite des Arms wandert in dessen Richtung. Blasse Arme gehen wegen eines Schlosses nicht. Winkel und Ebene stehen in der Leiste, der Winkel lässt sich an der Schräge auch später ändern.
- **Schlösser:** In der Leiste eines markierten Rohrs oder Punkts stehen 🔒/🔓 für Anfang und Ende. Beide fest: Schenkel gleichen aus. Anfang lose, Ende fest: Das Rohr wandert, das Ende bleibt stehen. Ende lose: Das Ende läuft mit.
- **Ruhige Maße:** Beim Zoomen, Drehen und Ziehen behalten Maßzahlen ihren Platz. Erst nach der Bewegung sucht sich eine überdeckte Zahl einmal einen besseren.
- **Maße antippen:** Maßzahlen liegen über Griffen und Pfeilen und weichen ihnen aus. Tippen gilt dem Maß, Ziehen dem Griff darunter.
- **Exakter Abstand:** Ein Parallelrohr beginnt und endet orthogonal versetzt, jeder Schenkel läuft exakt parallel zum Quellrohr. Auf Schenkeln quer zur Versatzrichtung stimmt der Abstand genau. An Ecken im Raum und an zu kurzen Schenkeln gibt der Abstand auf den schrägen Stücken so wenig wie nötig nach, nie unter 60 %. Läuft ein Schenkel selbst in Versatzrichtung, wechselt das Rohr ab dort die Seite.
- **Einklappbare Menüs:** Die Ansichten zeigen nur die aktuelle; Antippen öffnet die Liste, die Wahl oder ein Tipp in die Zeichnung schließt sie. Rohr, Parallelrohr und Ebene liegen im Plus-Menü, die Rohrfarbe hinter dem Farb-Icon oben rechts. Die Legende steht im Anzeige-Menü 👁.
- **Ende fest (Standard):** A und Rohrende bleiben stehen. Änderungen gleichen freie Schenkel über ihre Länge aus, zuerst „⇄ Ausgleich“, nie „🔒 Fest“. Ausgeglichene Maße stehen in Klammern.
- **Punkte:** S1/E1, S2/E2 … „+ Rohr“ legt nur die Punkte an (gestrichelt), „Weg vorschlagen“ verlegt das Rohr. Punkt antippen: „Verschieben“ (Pfeile, Koordinaten) oder „Maß“: zweiten Punkt oder Ebene antippen, Achse wählen. Je Achse gilt Bezug + Maß; abhängige Punkte wandern mit, Maß 0 heißt fluchtend bzw. gleiche Höhe.
- **Referenzebenen:** „+ Ebene“ (X, Y oder Z), Standard 1000 × 1000 mm, in den Achsfarben stark durchscheinend. Ebene antippen: Pfeile verschieben sie in X, Y und Z, Lage und Größe stehen in der Leiste. Punkte und Schenkel lassen sich daran ausrichten, auch bei ausgeblendeter Ebene über die Knöpfe in der Leiste. Bezugsmaße nennen den Bezug (z. B. „R1: 300 Z“) und erscheinen beim Antippen von Punkt oder Ebene; die Ausrichtung gilt für die ganze unendliche Ebene.
- **Abschnitt verschieben:** Gerade antippen, Pfeile in der Mitte ziehen. Erst gleichen bestehende Schenkel aus: auf jeder Seite der nächste passende Schenkel wird länger oder kürzer, was dazwischen liegt, wandert mit. Nur wenn es keinen gibt, entsteht ein neuer Schenkel mit zusätzlicher Biegung; bei „Ende frei“ wandert stattdessen das Rohrende mit. Läuft ein Schenkel dabei auf Länge 0, entfällt er samt Bogen.
- **Parallelrohre:** Griff am Rohranfang antippen, „Parallelrohr“: Pfeile legen Rohre an, der Ring dreht das Bündel, Punkte und Maße ändern Abstände zum Nachbarn. Lagewechsel am Eckpunkt.
- **Biegen:** Schritt-für-Schritt-Anleitung je Rohr, Drucken/PDF.
- **Einstellungen:** Projekt (Name, Zange und Zugaben für alle Rohre, Duplizieren, Export, Import, Löschen), Zangenprofile, Labor.
- **Labor:** experimentell – klassische Rohr-Eingabe, Raum mit Wänden, Schellen, Montage und Material.

## Daten

Projekte, Räume und Zangenprofile werden nur im Browser des jeweiligen Geräts gespeichert (localStorage).
Über „Teilen / Export“ und „Import“ lassen sie sich zwischen Geräten übertragen.
