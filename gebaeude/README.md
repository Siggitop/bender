# Gebäude

Eigenständige Anwendung zum Erfassen der Gebäudestruktur (Geschosse, Achsraster, Planunterlage, Wände, Stützen, Träger, Decken, Öffnungen, Dächer, Treppen, Rasterdecken, Räume, Schächte) mit IFC-Export. Sie liegt in diesem Ordner, hat eine eigene Startseite (`index.html`), eine eigene Versionsnummer (`version.js`), einen eigenen Offline-Speicher (`sw.js`) und einen eigenen Datenspeicher (IndexedDB „biege-bau“). Mit dem Rohrbiege-Assistenten im Ordner darüber besteht keine Verbindung; die Gebäude-App läuft allein.

Starten: im Projektordner `python3 -m http.server 8765`, dann `http://localhost:8765/gebaeude/` öffnen (Testmodus: `?debug`, Selbsttest in der Konsole: `biegeDebug.bau.selfTest()`).

Weiterführend: [ROADMAP-GEBAEUDE.md](ROADMAP-GEBAEUDE.md) (Stand und Versionsgeschichte), [ROADMAP-UX.md](ROADMAP-UX.md) (Roadmap Nutzererfahrung), [DESIGN.md](DESIGN.md).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html`, `app.js` | Startseite, Start des Werkzeugs, Hinweise und Rückfragen |
| `manifest.webmanifest`, `sw.js`, `version.js`, `icon*` | App-Eigenschaften, Offline-Speicher, Version, Symbole |
| `style.css` | Grundstile (Kopie der Rohr-App-Grundstile, kann beschnitten werden) |
| `building.js` | Gebäude-Werkzeug: Geschosse, Achsraster, Planunterlage, Wände, Stützen, Decken. Eigener Speicher in IndexedDB |
| `building-math.js` | Gebäude: Vektoren, Polygone, Zahlen lesen und formatieren (rein, ohne Zustand) |
| `building-steel.js` | Gebäude: Stahlprofile und Profilumriss |
| `building-store.js` | Gebäude: Speicher (IndexedDB), neues Gebäude, Datei-Download |
| `building-data.js` | Gebäude: Symbole, Namen, Vorgaben, Fenstervorlagen |
| `building-css.js` | Gebäude: Gestaltung (CSS kommt mit dem Modul) |
| `building-test.js` | Gebäude: Selbsttest, nur im Testmodus (`?debug`, in der Konsole `biegeDebug.bau.selfTest()`) |

## Funktionen

- **Bauteiltypen (Version 275):** Wand-, Decken-, Stützen-, Fenster- und Türtypen (Wände und Decken mit Schichten); Typ wählen oder neu aus Auswahl anlegen, „Typ bearbeiten“ ändert alle Exemplare; Schichten im Grundriss und im IFC (Schichtaufbau).
- **Gebäude-App (Eigenschaften-Palette, Version 274):** Bauteil-Editoren, Geschoss und Planunterlage stehen am Desktop in der Palette rechts; Mengen, Bezug und IFC als einklappbare Abschnitte.
- **Gebäude-App:** Eigenständiges Werkzeug ohne Verbindung zum Rohrteil, ausgelegt für Mac und iPad. Mehrere Gebäude über den Gebäude-Knopf oben links (neu mit Startfenster, öffnen, umbenennen, duplizieren, löschen, als Datei sichern und laden); gespeichert wird automatisch. Projektmanager mit Struktur (Geschoss → Raum → Bauteil) und Layern, Messen (Abstand, Kette, Fläche, Bauteil), Treppen (gerade, zweiläufig, Deckenöffnung automatisch), Bodenplatte, Keller, Gelände, Rasterdecke mit Rasterstart und Plattenmengen, Tastaturkürzel. Ab 1000 px Breite Desktop-Oberfläche mit Menüband (Reiter und Gruppen), angedocktem Projektbrowser und Eigenschaften, Optionsleiste, Statusleiste, Rechtsklick-Menü und Kontext-Reitern; schmaler wie bisher. Zahlenfelder verstehen deutsches Format („1.260“, „1,26 m“, „126 cm“, „2*600“). Bauteile auf Achsen folgen der Achse (lösbar). Fenster, Türen und Durchbrüche über antippbare Maße ausrichten. Fang in 3D an Ecken und Kanten, beim Messen auch Flächen und X/Y/Z-Strahlen. Drehen um den Punkt unter dem Zeiger bzw. um die Auswahl, Einpassen (F) und Doppeltippen zoomen auf die Auswahl. Objektfang (auch Stützenecken, -kantenmitten und -flächen) mit Fluchten (Spurlinien), Ortho, Lot, Verlängerung, Mitte; Längen am Mac direkt eintippen. Fenster frei teilbar (Felder, Ober-/Unterlicht, Öffnungsart je Feld, Vorlagen). Achsraster direkt auf dem Plan zeichnen: parallele Achsen per Abstand (auch „3x7500“) oder Tippen, Maßketten mit antippbaren Abständen (je Achsgruppe getrennt, Seite wählbar), Achsköpfe, Neu nummerieren, Achsen stufenlos ziehen mit Mitnahme (nur diese, alle folgenden, ganze Richtung); Kalibrieren mit Ortho und „Plan ausrichten“. Stützen in Wänden sparen die Wand aus und lassen sich bündig links, mittig oder bündig rechts setzen. Einstellungen in den Befehlsleisten als Auswahlknöpfe mit Liste, Fang als Schalterliste mit Erklärung. Geschosse (kopierbar), Achsraster, Planunterlage (Bild/PDF kalibrieren), Wände, Stützen und Träger (auch Stahl mit Profilkatalog), Decken, Türen, Fenster, Durchbrüche, Flach- und Steildächer, Rasterdecken, Räume mit Fläche, Schächte; Mehrfachauswahl, Verschieben, Kopieren, Teilen; IFC-Export und Ansicht als Bild. Eigener Speicher, die Rohrprojekte bleiben unberührt. Stand und Lücken in [ROADMAP-GEBAEUDE.md](ROADMAP-GEBAEUDE.md).
