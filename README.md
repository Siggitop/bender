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

- **Rohr:** Schenkel mit Richtungsknöpfen und Achsmaß; Vorschau zeigt den bearbeiteten Schenkel. „＋“ oben legt ein neues gerades Rohr an.
- **Parallelrohre:** feste Abstände zu Rohr 1, laufen bei jeder Änderung mit. In 3D dreht „⟳ Bündel“ die Lage um das Rohr; nicht verlegbare Rohre werden rot.
- **Lagewechsel:** Bündel an einer Ecke kippen (z. B. übereinander → nebeneinander). Rohr 1 biegt normal, die Parallelrohre laufen über die Ecke hinaus, gehen senkrecht auf die neue Höhe und biegen weiter. Im Bündel-Kasten oder in 3D unter „✎ Maße“ → „Bündel auf diesem Schenkel“.
- **3D:** Gerade antippen = Längenpfeil, Eckpunkt antippen = Drehringe, Griff am Ende: antippen oder ziehen zeigt die Fortführ-Pfeile (am Rechner beim Darüberfahren blass); „Fortführ-Pfeile immer zeigen“ im 👁-Menü. Maße als technische Bemaßung (schräge Schenkel zusätzlich orthogonal), antippen = Wert ändern. Optional „Gesamtmaße“: Versatz vom Rohranfang bis zum Rohrende in X/Y/Z. Optional „Winkelmaße“: Biegewinkel an jedem Schnittpunkt.
- **Ende fixiert (📌, Standard):** A und Rohrende bleiben im Raum stehen. Ändert sich eine Länge oder ein Winkel, gleichen freie Schenkel über ihre Länge aus – zuerst als „⇄ Ausgleich“ markierte, nie „🔒 Fest“ markierte. Ausgeglichene Maße stehen in Klammern. Geht es nicht, bleibt alles wie vorher und ein Hinweis nennt den Grund.
- **Biegen:** Schritt-für-Schritt-Anleitung, Drucken/PDF.
- **Zangen:** Zangenprofile (Rohr-Ø, Biegeradius, Mindest-Gerade). Marken fest: „0“ = Biegeanfang, L/R = Schnittpunkt bei 90°.
- **Labor (unter „Zangen“):** experimentell – Raum mit Wänden, Schellen, Ziel-Anschluss, Montage und Material. Ausgeschaltet bleiben diese Daten gespeichert, werden aber nicht gerechnet.

## Daten

Projekte, Räume und Zangenprofile werden nur im Browser des jeweiligen Geräts gespeichert (localStorage).
Über „Teilen / Export“ und „Import“ lassen sie sich zwischen Geräten übertragen.
