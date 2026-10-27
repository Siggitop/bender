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

- **Rohr:** Schenkel mit Richtungsknöpfen und Länge; Vorschau zeigt den bearbeiteten Schenkel. Parallelrohre laufen mit.
- **3D:** Werkzeuge „Rohr“ (Gimbal am Ende, Ringe am gewählten Schenkel), „Schellen“, „Raum“ (Grundriss zeichnen, Wände ziehen, Maße antippen).
- **Raum:** Raum anlegen, Wandlängen, Rohr an einer Wand ausrichten, Ziel-Anschluss, Schellen.
- **Biegen:** Schritt-für-Schritt-Anleitung je Rohr, Montage mit Bohrpunkten, Material, Drucken/PDF.

## Daten

Projekte, Räume und Zangenprofile werden nur im Browser des jeweiligen Geräts gespeichert (localStorage).
Über „Teilen / Export“ und „Import“ lassen sie sich zwischen Geräten übertragen.
