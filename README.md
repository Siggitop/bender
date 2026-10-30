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
