# Roadmap: Gebäude-Experiment

Stand: 08.11.2026. **Phase 0 bis 6 und IFC-Export aus Phase 8 umgesetzt (Version 255)**, siehe Abschnitt 6 bis 8. Phase 7 (Verbindung zum Rohrteil) ist zurückgestellt und wieder ausgebaut: Das Gebäude wird vorerst als eigenständiges Werkzeug entwickelt. Ziel: Gebäudestruktur (Tragwerk, Wände, Decken, Öffnungen, Dächer, Ausbau) im Rohrbiege-Assistenten erfassen, zunächst als versteckte Experiment-Option. Später geht der Rohrteil im Gebäude auf, das Gebäude ist der Rahmen für die HLK-Infrastruktur.

## 1. Leitlinien

1. **Versteckt und getrennt.** Ohne Experiment-Schalter ändert sich nichts: kein Menüeintrag, kein Code geladen, keine Daten angefasst. Der Schalter „Experimente“ erscheint in den Einstellungen erst, wenn man die App mit `?exp` öffnet.
2. **Eigener Datenspeicher.** Das Gebäude liegt in IndexedDB, nicht in `biege.v1`. Ein Fehler im Experiment kann die Rohrprojekte nicht beschädigen. Verknüpft wird nur über IDs („Szene X liegt in Geschoss 2“). localStorage (rund 5 MB) reicht für Geschosse und Planunterlagen nicht.
3. **Eigenes Modul.** Neue Datei (zum Beispiel `building.js`), nachgeladen nur bei eingeschaltetem Experiment, wie heute der Bauteil-Editor. Gemeinsam mit dem Rohrteil: Ansicht, Gizmo, Maße, Fangpunkte, Rückgängig.
4. **Datenmodell vor Darstellung.** Reines JSON: Gebäude → Geschoss → Bauteile, jedes mit stabiler ID, Typ und Parametern. Einheit mm, Z nach oben, wie im Rohrteil.
5. **IFC-nah.** Typen angelehnt an IFC (Storey, Column, Beam, Wall, Slab, Covering, Roof, Door, Window, Opening, Space), damit ein späterer IFC-Export eine Übersetzung ist und kein Umbau.
6. **Bedienung wie im Rohrteil:** Fusion 360 als Vorbild, Regeln aus DESIGN.md und KONZEPT.md (Referenz, Sperren, Gimbal, Maße im Bild). Zeichnen realistisch am Mac oder iPad, auf dem iPhone vor allem ansehen und messen.

## 2. Vier Bauteil-Arten statt vieler Einzelfälle

Fast jedes Bauteil ist eine von vier Grundformen. Sind diese sauber gebaut, ist ein neues Bauteil nur noch Parameter und Darstellung.

| Art | Wird gezeichnet als | Bauteile |
|---|---|---|
| **Punktbauteil** | Punkt + Profil + Höhe | Stützen (Beton, Stahl), Einzelfundamente |
| **Linienbauteil** | Achse von A nach B + Profil | Wände, Unterzüge, Stahlträger, Attika/Sims, Brüstungen |
| **Flächenbauteil** | Umriss + Dicke + Höhenlage | Geschossdecken, Bodenplatte, Rasterdecken, Flachdach, Dachflächen |
| **Gehostetes Bauteil** | sitzt in einem anderen Bauteil | Fenster, Türen, Durchbrüche in Wand oder Decke |

**Bezüge:** Achsraster und Geschosse mit Höhen. Jedes Bauteil hängt an ihnen, zum Beispiel „Stütze auf Achse B/3, von OK Rohdecke EG bis UK Decke 1. OG“. Ändert sich eine Geschosshöhe, wandert alles mit.

## 3. Phasen

### Phase 0: Fundament
- Experiment-Schalter, IndexedDB-Speicher, Modul `building.js`
- Datenmodell mit IDs, Typen, Parametern, Bezügen
- Darstellung: WebGL-Ansicht für das Gebäude, damit auch viele Bauteile auf dem iPhone flüssig bleiben
- Rückgängig, Speichern, Export/Import als Datei

**Fertig, wenn:** ein leeres Gebäude angelegt, gespeichert, geladen und rückgängig gemacht werden kann, ohne dass die Rohrdaten berührt werden.

### Phase 1: Bezüge und Planunterlage
- **Geschosse:** Name, OK Rohdecke, Geschosshöhe, Fußbodenaufbau, daraus OKFF und UK Decke
- **Achsraster:** Achsen mit Abständen (1, 2, 3 … / A, B, C …), Schnittpunkte als Fangpunkte, auch schräge Achsen
- **Planunterlage:** PDF oder Bild je Geschoss laden, an zwei Punkten mit bekanntem Maß kalibrieren, blass darunterlegen
- **Grundriss-Ansicht** je Geschoss neben der 3D-Ansicht

**Fertig, wenn:** der Architektenplan eingelegt, kalibriert und das Raster darübergelegt ist.

### Phase 2: Rohbau-Grundformen
- **Wände:** Achse, Dicke, Lage zur Achse (innen, Mitte, außen), Höhe von Geschoss zu Geschoss oder frei. Ecken und T-Stöße werden automatisch verschnitten.
- **Stützen:** rund oder rechteckig, fangen auf Rasterpunkte
- **Geschossdecken:** Umriss zeichnen oder aus Wänden übernehmen, Dicke, Aussparungen
- **Bodenplatte** als Sonderfall der Decke
- Ausgangspunkt: das Raum-Werkzeug aus `site.js` (Grundriss → Wände, Boden, Decke)

**Fertig, wenn:** ein Geschoss mit Stützen, Wänden und Decke steht und eine geänderte Geschosshöhe alles mitnimmt.

### Phase 3: Öffnungen
- **Türen:** Breite, Höhe, Anschlag links/rechts, Aufschlagrichtung, Symbol im Grundriss
- **Fenster:** Breite, Höhe, Brüstungshöhe
- **Durchbrüche** in Wand und Decke, rechteckig oder rund (wichtig für Rohre und Kanäle)
- Öffnungen wandern mit ihrem Bauteil, schneiden es aus, Verschieben nur längs der Wand

**Fertig, wenn:** Türen und Fenster in Wände gesetzt, verschoben und bemaßt werden können.

### Phase 4: Tragwerk
- **Unterzüge:** Linienbauteil unter der Decke, Breite × Höhe, Bezug UK Decke
- **Stahlträger und Stahlstützen** mit Profilkatalog (HEA, HEB, IPE, U, Rundrohr, Rechteckrohr), Drehung um die eigene Achse. Vorbild ist der Fitting-Katalog.
- Fangpunkte an Trägerkanten und Flanschen (später für Rohrhalter)

**Fertig, wenn:** eine Stahlbühne aus Stützen und Trägern gebaut werden kann.

### Phase 5: Dächer
- **Flachdach:** Flächenbauteil, optional mit Gefälle. **Attika/Sims** als Linienbauteil auf dem Rand mit Querschnitt (Höhe, Breite, Überstand), Kante einfach wählen.
- **Schräge Dächer:** Jede Umrisskante bekommt eine Neigung oder „Giebel“, daraus entstehen Pult-, Sattel- und Walmdach automatisch. Dazu Traufhöhe und Überstand.
- Rechnerisch die kniffligste Phase, deshalb nach den Grundformen.

**Fertig, wenn:** ein Flachdach mit Attika und ein Satteldach mit Überstand entstehen.

### Phase 6: Ausbau
- **Rasterdecken (abgehängt):** Fläche je Raum, Abhanghöhe, Raster (zum Beispiel 625 × 625), Startpunkt ausrichtbar, einzelne Platten entfernbar für Revisionsöffnungen. Der Raum darüber ist der HLK-Bereich.
- **Räume:** aus Wänden erkannt, mit Name, Nummer, Fläche
- **Schächte und Technikzentralen** als markierte Zonen über mehrere Geschosse

### Phase 7: Verbindung zum Rohrbiege-Assistenten
- Rohr-Szenen werden einem Geschoss oder Raum zugeordnet und erscheinen im Gebäude.
- Wände, Decken und Unterzüge ersetzen die heutigen Ebenen: Abstände, Fangpunkte und Schatten beziehen sich auf echte Bauteile.
- Kreuzt ein Rohr eine Wand oder Decke, gibt es einen Durchbruch-Vorschlag.
- Kollisionsprüfung Rohr gegen Bauteil.

### Phase 8: Austausch und Pläne
- IFC-Export, danach IFC-Import der Gebäudehülle vom Architekten
- Schnitte und Ansichten, Grundriss als PDF

### Später
Treppen, Rampen, Aufzugsschächte, Vorsatzschalen und Trockenbau, Doppelboden, Fundamente im Detail, Geländer, Materialien und Schichtaufbauten. DWG/DXF als Planunterlage (braucht eine fremde Bibliothek).

## 4. Reihenfolge und Aufwand (grob)

| Phase | Umfang | Nutzen allein |
|---|---|---|
| 0 Fundament | mittel | keiner, aber Pflicht |
| 1 Bezüge + Planunterlage | mittel | hoch: Plan einlegen und nachzeichnen |
| 2 Wände, Stützen, Decken | groß | hoch: erstes echtes Gebäude |
| 3 Öffnungen | mittel | mittel |
| 4 Tragwerk / Stahl | mittel | hoch für HLK-Befestigung |
| 5 Dächer | groß | mittel |
| 6 Ausbau / Rasterdecke | mittel | hoch für HLK |
| 7 Verbindung Rohrteil | mittel | sehr hoch |
| 8 IFC / Pläne | groß | je nach Bedarf |

**Empfehlung:** Phase 0 bis 2 als erster Block. Danach Phase 7 vorziehen, also die Rohre ins Gebäude holen, bevor Dächer und IFC kommen. Dort liegt der eigentliche Mehrwert, und man merkt früh, ob das Zusammenspiel trägt.

## 5. Risiken

- **Darstellung:** Die heutige 3D-Ansicht reicht für Rohre in einem Raum. Ein ganzes Gebäude braucht wahrscheinlich WebGL. Das ist der größte Einzelbrocken und betrifft später auch den Rohrteil.
- **Größe von `app.js`:** Schon rund 8000 Zeilen. Das Gebäude kommt deshalb in ein eigenes Modul, gemeinsame Teile werden bei Bedarf herausgelöst.
- **Bedienung auf dem iPhone:** Gebäude zeichnen ist dort mühsam. Schwerpunkt Mac und iPad, iPhone zum Ansehen, Messen und für den Rohrteil.
- **Speicher:** Planunterlagen (PDF, Bilder) sind groß. Ohne IndexedDB und Export als Datei ist Datenverlust durch Safari möglich.

## 6. Umgesetzt (Version 253)

**Einschalten:** App mit `?exp` in der Adresse öffnen → Einstellungen → Experimente → „Gebäude“. Danach erscheint der Tab „Gebäude“ (auch ohne `?exp`). Ausschalten blendet ihn wieder aus, die Daten bleiben.

**Technik:** `building.js`, nachgeladen erst beim Öffnen. Speicher in IndexedDB `biege-bau` (Gebäude unter `buildings/main`, Unterlagen als Bilddateien unter `files`). Eigene Kamera und eigenes WebGL nach dem Muster des Bauteil-Editors. Rückgängig/Wiederholen über Schnappschüsse.

**Phase 0:** Experiment-Schalter, eigener Speicher, Sichern als JSON-Datei und Laden (ohne Unterlagen), 3D und Grundriss (Grundriss: Wände und Stützen dunkel, Decken hell).

**Phase 1:**
- Geschosse mit Name, OK Rohdecke, Höhe; „+ darüber“ / „+ darunter“ mit Namensvorschlag (EG → 1. OG, UG …); Löschen mit Rückfrage. In 3D sind die Geschosse über dem aktuellen ausgeblendet (Schalter „Geschosse darüber“).
- Achsraster: „Raster erzeugen“ (Anzahl und Abstand in beiden Richtungen, 1, 2, 3 … und A, B, C …) oder einzelne Achse mit zwei Punkten. Achsschnittpunkte und Achsen sind Fangpunkte. Name und Enden änderbar.
- Planunterlage je Geschoss: Bild oder PDF (Seite 1, pdf.js wird dafür einmalig aus dem Netz geladen). Kalibrieren (zwei Punkte, echter Abstand), Verschieben (Punkt auf dem Plan → Zielpunkt mit Fangen), Drehung, Deckkraft.

**Phase 2:**
- Wände: Kette von Punkten, Startpunkt schließt den Umriss. Dicke, Lage zur Achse (links, Mitte, rechts in Zeichenrichtung), Länge per Feld und Richtungspfeil (→ ↑ ← ↓). Höhe leer = bis OK Rohdecke des Geschosses darüber, sonst fest; Fuß-Versatz. L-Ecken auf Gehrung.
- Stützen: eckig (B × T, Drehung) oder rund (Ø), auf Achsschnittpunkte fangend.
- Decken: Umriss tippen oder „Aus Wänden“ (geschlossener Wandumriss, Außenkante der Wände). Oberkante = OK Rohdecke des Geschosses, Dicke nach unten.
- Auswählen, Werte im Feld ändern, Löschen. Ziehen an Anfassern: Wandenden (verbundene Wände laufen mit), Wand verschieben, Stütze verschieben, Deckenecken, Achsenden.
- Fangen: Wandenden und -mitten, Wandenden des Geschosses darunter, Stützen, Deckenecken, Achsschnittpunkte, Achsen; sonst 15°-Winkel und 10-mm-Raster.

**Bekannte Lücken:** siehe Abschnitt 7.

## 7. Nachgezogen (Version 254)

**Lücken aus Phase 2:**
- T-Stöße: Endet eine Wand auf der Achse einer anderen, endet sie an deren Fläche (keine Überlappung mehr).
- Höhe eines Geschosses ändern schiebt alle Geschosse darüber mit.
- „Sichern“ nimmt Planunterlagen (als Bilddaten) und die Zuordnungen der Rohrprojekte mit, „Laden“ stellt sie wieder her.
- Die Planunterlage erscheint nur im Grundriss und beim Kalibrieren oder Verschieben; in 3D verdeckte sie das Modell.
- „Geschosse darüber zeigen“ steht jetzt in der Liste, die Werkzeugleiste hat Platz für „Öffnung“.

**Phase 3, Öffnungen** (Werkzeug Tür-Symbol, Art in der Leiste: Tür, Fenster, Durchbruch, Decke):
- Tür, Fenster, Wanddurchbruch: auf eine Wand tippen, sitzt dort über die ganze Wanddicke, Breite und Höhe, Fenster mit Brüstung, Durchbruch mit Unterkante. Vorgaben: Tür 1010 × 2135, Fenster 1260 × 1385 / Brüstung 900, Durchbruch 300 × 300 / UK 2300.
- Die Wand wird an der Öffnung ausgespart (Brüstung und Sturz bleiben). Öffnungen wandern mit der Wand, verschieben nur entlang der Wand (Quadrat ziehen oder „ab Wandanfang“), bleiben bei kürzerer Wand in der Wand und verschwinden mit ihr.
- Tür: Anschlag links/rechts, Aufschlag auf diese oder die andere Seite; im Grundriss mit Türblatt und Aufschlagbogen. Fenster im Grundriss als Rahmen mit Mittellinie.
- Deckendurchbruch: auf eine Decke tippen, rechteckig B × T, die Decke bekommt ein echtes Loch.
- Gewählte Öffnung: Maß vom Wandanfang und Breite im Bild.

**Phase 7, erster Teil** (in Version 255 wieder entfernt, siehe Abschnitt 8):
- Im Gebäude unter „Rohrprojekte“ eine Szene der Rohrplanung einem Geschoss zuordnen, Lage per X/Y/Z (Z ab OK Rohdecke). Ihre Rohre erscheinen im Gebäude (nur Anzeige, in der Rohrfarbe; Fittings noch nicht).
- Im Rohrteil im Ebenen-Menü „Aus Gebäude (Experiment)“: übernimmt achsparallele Wandflächen, Flächen eckiger Stützen, den Fußboden (OK Rohdecke) und die Deckenunterseite des Geschosses darüber als Ebenen, nur im Umkreis von 3 m um die Rohre. Erneutes Übernehmen ersetzt die früher übernommenen, eigene Ebenen bleiben; ein Rückgängig-Schritt. Damit gelten Abstände, Fangen und Schatten wie bei eigenen Ebenen.

**Bekannte Lücken:**
- Schräge Wände und gedrehte oder runde Stützen geben keine Ebenen (die Ebenen der Rohrplanung sind achsparallel).
- Fittings und Bestandsrohre erscheinen im Gebäude noch nicht. Rohre aus dem Gebäude heraus bearbeiten geht nicht.
- Kein automatischer Durchbruch-Vorschlag, wo ein Rohr eine Wand kreuzt, keine Kollisionsprüfung (Rest von Phase 7).
- PDF: nur Seite 1, braucht beim ersten Laden Internet; nicht getestet. Bilder getestet.
- Bauteile lassen sich nur im aktuellen Geschoss auswählen. Maße nur an der gewählten Wand oder Öffnung.

## 8. Version 255: eigenständig, Phasen 4 bis 6, IFC

**Entscheidung (08.11.2026):** Das Gebäude bleibt versteckter Tab, wird aber unabhängig vom Rohrteil entwickelt. Die Verbindung aus Phase 7 ist ausgebaut: kein „Aus Gebäude“ im Ebenen-Menü, keine Rohrprojekte im Gebäude. Früher gespeicherte Zuordnungen bleiben unbenutzt in den Daten liegen.

**Fangen beim Zeichnen (korrigiert):**
- Ortho: Liegt die Richtung ab dem letzten Punkt nahe am 15°-Raster, bleibt sie dort, auch wenn eine Achse oder Wand in der Nähe ist. Dann fängt der Schnittpunkt des Ortho-Strahls mit der Linie („Achse 2 · Ortho“, „Wandfläche · Ortho“).
- Punktfang (Enden, Ecken, Achsschnitte) gilt mit Ortho nur, wenn der Punkt auf dem Strahl liegt oder der Zeiger sehr nahe ist.
- Linienfang auf Wänden: Wandachse und beide Wandflächen, auch der Wände, die gerade in der Kette entstanden sind; dazu Trägerachsen und die Kanten von Decken, Dächern, Rasterdecken, Räumen, Schächten. Zwei Linien nahe beieinander: ihr Schnittpunkt.

**Arbeitshilfen:**
- Geschoss kopieren: „Kopie als neues Geschoss oben“ (alle Bauteile mit Öffnungen, ohne Schächte).
- Mehrfachauswahl: Shift-Klick am Mac, „+ Weitere“ auf dem Touchscreen; Tafel mit Anzahl je Bauteilart.
- Verschieben und Kopieren (Basispunkt → Zielpunkt, mit Fangen und Ortho); Kopieren mit Anzahl für Reihen. Öffnungen gehen mit ihrer Wand oder Decke.
- Wand teilen: Öffnungen kommen auf das Stück, in dem sie liegen.

**Phase 4, Tragwerk:**
- Träger (Werkzeug neben Stütze): Unterzug B × H oder Stahl mit Profil, Oberkante (OK) über OK Rohdecke, Vorgabe Geschosshöhe − Deckendicke. Stahl auch „Liegend“ (90° gedreht).
- Stützen auch aus Stahl, Drehung in Grad.
- Profilkatalog: IPE 80–600, HEA/HEB 100–500, UPN 80–300, RO 48,3–219,1 (Rundrohr), QRO 50–200 (Quadratrohr), echte Querschnitte (I, U, hohl).

**Phase 5, Dächer** (Menü „⋯“ → Dach):
- Flach: Platte auf Traufhöhe, Überstand, Attika mit Höhe, Breite und Sims (Überstand nach außen).
- Geneigt: je Umrisskante Traufe mit Neigung oder Giebel; Formen Satteldach, Pultdach, Walmdach per Knopf; Giebel werden auf Wunsch mit einer Scheibe gefüllt. Berechnet als untere Hülle der Dachflächen, exakt für Umrisse ohne einspringende Ecken.
- „Aus Wänden“ übernimmt die Außenkante eines geschlossenen Wandumrisses.

**Phase 6, Ausbau** (Menü „⋯“):
- Rasterdecke: in einen Raum tippen oder Umriss zeichnen; Unterkante, Raster (Vorgabe 625 × 625), „Raster mittig“, einzelne Platten herausnehmen. In 3D durchscheinend, im Grundriss gestrichelt.
- Raum: in einen von Wänden umschlossenen Bereich tippen, die Fläche wird erkannt (Wände als Grenze, Türen schließen nicht auf; auf etwa 1 cm genau). Nummer, Name, Fläche im Grundriss.
- Schacht: Rechteck über zwei Ecken, von seinem Geschoss bis zu einem Geschoss darüber; Decken dazwischen werden ausgespart. Im Grundriss mit Kreuz.
- Im Grundriss: Träger, Dächer, Rasterdecken, Schächte (über der Schnittebene) gestrichelt.

**Phase 8, Teil:**
- IFC exportieren (IFC4): Projekt, Grundstück, Gebäude, Geschosse; Wände, Decken, Dach (IfcSlab ROOF), Stützen, Träger, Rasterdecken (IfcCovering), Räume und Schächte (IfcSpace), Türen, Fenster, Durchbrüche (IfcOpeningElement mit Bezug zur Wand/Decke). Geometrie als Dreiecksnetz (IfcFacetedBrep). Die Datei ist formal geprüft (alle Verweise vorhanden), aber noch nicht in einem IFC-Viewer geöffnet worden.
- Ansicht als Bild (PNG): aktuelle Ansicht mit Beschriftung.

**Offen:**
- IFC-Import, Schnitte, Pläne als PDF mit Maßketten.
- Treppen, Rampen, Aufzugsschächte, Brüstungen und Geländer, Vorsatzschalen.
- Dächer mit einspringenden Ecken (L-Grundriss) exakt; Gauben.
- Phase 7 (Rohre im Gebäude), wenn das Gebäude-Werkzeug steht.
